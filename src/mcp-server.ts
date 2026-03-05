#!/usr/bin/env node
// Grafeo MCP Server — gives AI code agents deep, persistent understanding of any codebase

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { sql, callReducer, sqlRowsToObjects, setDbConfig } from './db.js';
import { indexProject, reindexFile } from './indexer/index.js';
import { readFile as fsReadFile, stat, readdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, type GrafeoConfig } from './config.js';

// =============================================================================
// Project root resolution
// =============================================================================

const PROJECT_ROOT = process.env.GRAFEO_PROJECT_ROOT || process.cwd();
let projectConfig: GrafeoConfig | null = null;

async function getConfig(): Promise<GrafeoConfig | null> {
  if (!projectConfig) {
    projectConfig = await loadConfig(PROJECT_ROOT);
    if (projectConfig?.spacetimedb) {
      setDbConfig(projectConfig.spacetimedb);
    }
  }
  return projectConfig;
}

// =============================================================================
// In-memory cache (reduces SpacetimeDB roundtrips)
// =============================================================================

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000;

function cached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

// =============================================================================
// Helper: fuzzy search scoring
// =============================================================================

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.includes(q)) return 80;
  if (t.startsWith(q)) return 90;

  let score = 0;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { score += 10; qi++; }
  }
  return qi === q.length ? score : 0;
}

// =============================================================================
// MCP Server setup
// =============================================================================

const server = new Server(
  { name: 'grafeo', version: '0.1.2' },
  { capabilities: { tools: {} } }
);

// =============================================================================
// Tool definitions
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Context & Understanding ──
    {
      name: 'get_file_context',
      description: 'Get everything known about a file: purpose, symbols, dependencies, annotations, who uses it.',
      inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Relative file path' } }, required: ['path'] }
    },
    {
      name: 'search_codebase',
      description: 'Search across the indexed codebase. Searches file paths, symbol names, and annotations.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search term' }, kind: { type: 'string', description: 'Optional: filter by symbol kind' } }, required: ['query'] }
    },
    {
      name: 'get_dependency_graph',
      description: 'Get the dependency graph for a file or export. Shows imports and reverse dependencies.',
      inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'File path or export name' } }, required: ['target'] }
    },
    {
      name: 'get_blast_radius',
      description: 'Before editing a file, check how many other files depend on it. Shows risk level.',
      inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Relative file path' } }, required: ['file'] }
    },
    {
      name: 'get_export_info',
      description: 'Get full info about an exported symbol: properties, methods, usage count, and which files use it.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Export name' } }, required: ['name'] }
    },
    {
      name: 'get_module_overview',
      description: 'Get a summary of a module: file count, key components, entry point, related modules.',
      inputSchema: { type: 'object', properties: { module: { type: 'string', description: 'Module name' } }, required: ['module'] }
    },
    {
      name: 'get_framework_info',
      description: 'Get framework-specific info detected for this project.',
      inputSchema: { type: 'object', properties: {} }
    },

    // ── Knowledge Management ──
    {
      name: 'save_convention',
      description: 'Record a coding convention for the project. Persists across sessions.',
      inputSchema: { type: 'object', properties: { area: { type: 'string' }, rule: { type: 'string' }, example: { type: 'string' }, rationale: { type: 'string' } }, required: ['area', 'rule'] }
    },
    {
      name: 'get_conventions',
      description: 'Get all coding conventions, optionally filtered by area.',
      inputSchema: { type: 'object', properties: { area: { type: 'string' } } }
    },
    {
      name: 'save_decision',
      description: 'Log an architecture decision record (ADR).',
      inputSchema: { type: 'object', properties: { title: { type: 'string' }, context: { type: 'string' }, decision: { type: 'string' }, consequences: { type: 'string' }, tags: { type: 'string' } }, required: ['title', 'decision'] }
    },
    {
      name: 'annotate_file',
      description: 'Add a persistent note about a file. Categories: gotcha, todo, explanation, pattern, warning.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, note: { type: 'string' }, category: { type: 'string' } }, required: ['path', 'note'] }
    },
    {
      name: 'get_annotations',
      description: 'Get annotations for a file or all annotations.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
    },

    // ── Tasks & Continuity ──
    {
      name: 'create_task',
      description: 'Create a persistent task for multi-session work continuity.',
      inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, context: { type: 'string' } }, required: ['title'] }
    },
    {
      name: 'update_task',
      description: 'Update a task status and context.',
      inputSchema: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string' }, context: { type: 'string' } }, required: ['id', 'status'] }
    },
    {
      name: 'get_active_tasks',
      description: 'Get all active (non-completed) tasks.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'log_change',
      description: 'Record a change made to a file.',
      inputSchema: { type: 'object', properties: { file: { type: 'string' }, changeType: { type: 'string' }, summary: { type: 'string' }, relatedTask: { type: 'number' } }, required: ['file', 'changeType', 'summary'] }
    },

    // ── Analytics ──
    {
      name: 'get_project_stats',
      description: 'Get project statistics: file counts by type/module, symbol counts, dependency counts.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'find_hotspots',
      description: 'Find the most-imported files, most-used exports, highest complexity files.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'get_recent_changes',
      description: 'Get recently logged changes.',
      inputSchema: { type: 'object', properties: { limit: { type: 'number' } } }
    },

    // ── Indexing ──
    {
      name: 'reindex_file',
      description: 'Re-scan and re-index a single file after modification.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    },
    {
      name: 'reindex_all',
      description: 'Full project re-scan.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'index_status',
      description: 'Check indexing status: file counts, last indexed time.',
      inputSchema: { type: 'object', properties: {} }
    },

    // ── Power Tools ──
    {
      name: 'session_bootstrap',
      description: 'ONE call to start any session. Returns: project rules, active tasks, conventions, index status, recent changes.',
      inputSchema: { type: 'object', properties: { file_path: { type: 'string', description: 'Optional file for context hints' } } }
    },
    {
      name: 'read_file',
      description: 'Read any file from the project. Returns content with line numbers.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } }, required: ['path'] }
    },
    {
      name: 'get_project_rules',
      description: 'Inject the project AGENTS.md / CLAUDE.md / .cursorrules as context.',
      inputSchema: { type: 'object', properties: { section: { type: 'string' } } }
    },
    {
      name: 'preflight_check',
      description: 'MANDATORY before editing. Analyzes blast radius, deps, conventions for all files you plan to modify.',
      inputSchema: { type: 'object', properties: { intent: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, evidence: { type: 'string' } }, required: ['intent', 'files'] }
    },
    {
      name: 'find_examples',
      description: 'Search for code patterns in source files using grep. Returns matching lines with context.',
      inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, fileGlob: { type: 'string' }, maxResults: { type: 'number' }, contextLines: { type: 'number' } }, required: ['pattern'] }
    },
    {
      name: 'batch_context',
      description: 'Get context for multiple files AND exports in a single call.',
      inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, exports: { type: 'array', items: { type: 'string' } } } }
    },
    {
      name: 'postchange_audit',
      description: 'CALL AFTER editing files. Reindexes changed files, logs changes, and validates.',
      inputSchema: {
        type: 'object',
        properties: {
          changes: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, changeType: { type: 'string' }, summary: { type: 'string' } }, required: ['file', 'changeType', 'summary'] } },
          validationEvidence: { type: 'string' }
        },
        required: ['changes']
      }
    },
  ],
}));

// =============================================================================
// Tool implementations
// =============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      // ── Context & Understanding ──

      case 'get_file_context': {
        const filePath = (args as { path: string }).path;
        const [fileRes] = await sql(`SELECT * FROM files WHERE path = '${esc(filePath)}'`);
        if (!fileRes?.rows?.length) return text(`File not found in index: ${filePath}`);

        const file = sqlRowsToObjects(fileRes)[0];
        const [symRes] = await sql(`SELECT * FROM symbols WHERE file_path = '${esc(filePath)}'`);
        const symbols = symRes?.rows?.length ? sqlRowsToObjects(symRes) : [];
        const [depRes] = await sql(`SELECT * FROM dependencies WHERE source_file = '${esc(filePath)}'`);
        const deps = depRes?.rows?.length ? sqlRowsToObjects(depRes) : [];
        const [revRes] = await sql(`SELECT * FROM dependencies WHERE target_file = '${esc(filePath)}'`);
        const reverseDeps = revRes?.rows?.length ? sqlRowsToObjects(revRes) : [];
        const [annRes] = await sql(`SELECT * FROM annotations WHERE file_path = '${esc(filePath)}'`);
        const annotations = annRes?.rows?.length ? sqlRowsToObjects(annRes) : [];

        const publicSymbols = symbols.filter((s: any) => s.isPublic || s.is_public);
        const importSymbols = symbols.filter((s: any) => s.kind === 'import');

        return text([
          `# ${filePath}`,
          `Module: ${file.moduleName || file.module_name} | Type: ${file.fileType || file.file_type} | Complexity: ${file.complexity} | Size: ${file.size}B`,
          '',
          `## Public Symbols (${publicSymbols.length})`,
          ...publicSymbols.map((s: any) => `- ${s.kind} **${s.name}** ${s.typeInfo || s.type_info || ''}`),
          '',
          `## Imports (${importSymbols.length})`,
          ...importSymbols.map((s: any) => `- ${s.name}`),
          '',
          `## Dependencies (${deps.length} imports, ${reverseDeps.length} dependents)`,
          `Imports: ${deps.map((d: any) => d.targetFile || d.target_file).join(', ')}`,
          `Used by: ${reverseDeps.map((d: any) => d.sourceFile || d.source_file).join(', ')}`,
          '',
          annotations.length ? `## Annotations\n${annotations.map((a: any) => `- [${a.category}] ${a.note}`).join('\n')}` : '',
        ].join('\n'));
      }

      case 'search_codebase': {
        const { query, kind } = args as { query: string; kind?: string };

        // Search files by path
        const [fileRes] = await sql(`SELECT path, module_name, file_type, complexity FROM files`);
        const allFiles = fileRes?.rows?.length ? sqlRowsToObjects(fileRes) : [];
        const matchedFiles = allFiles
          .map((f: any) => ({ ...f, score: fuzzyScore(query, f.path) }))
          .filter((f: any) => f.score > 0)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 15);

        // Search symbols
        let symQuery = `SELECT * FROM symbols`;
        if (kind) symQuery += ` WHERE kind = '${esc(kind)}'`;
        const [symRes] = await sql(symQuery);
        const allSymbols = symRes?.rows?.length ? sqlRowsToObjects(symRes) : [];
        const matchedSymbols = allSymbols
          .map((s: any) => ({ ...s, score: fuzzyScore(query, s.name) }))
          .filter((s: any) => s.score > 0)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 15);

        return text([
          `# Search: "${query}"`,
          '',
          `## Files (${matchedFiles.length} matches)`,
          ...matchedFiles.map((f: any) => `- ${f.path} (${f.module_name || f.moduleName}, ${f.complexity})`),
          '',
          `## Symbols (${matchedSymbols.length} matches)`,
          ...matchedSymbols.map((s: any) => `- ${s.kind} **${s.name}** in ${s.file_path || s.filePath} :${s.line_number || s.lineNumber}`),
        ].join('\n'));
      }

      case 'get_dependency_graph': {
        const target = (args as { target: string }).target;
        const [fwdRes] = await sql(`SELECT * FROM dependencies WHERE source_file = '${esc(target)}'`);
        const [revRes] = await sql(`SELECT * FROM dependencies WHERE target_file = '${esc(target)}'`);
        const fwd = fwdRes?.rows?.length ? sqlRowsToObjects(fwdRes) : [];
        const rev = revRes?.rows?.length ? sqlRowsToObjects(revRes) : [];

        return text([
          `# Dependency Graph: ${target}`,
          '',
          `## Imports (${fwd.length})`,
          ...fwd.map((d: any) => `- → ${d.target_file || d.targetFile} (${d.dep_type || d.depType})`),
          '',
          `## Dependents (${rev.length})`,
          ...rev.map((d: any) => `- ← ${d.source_file || d.sourceFile}`),
        ].join('\n'));
      }

      case 'get_blast_radius': {
        const file = (args as { file: string }).file;
        const [revRes] = await sql(`SELECT * FROM dependencies WHERE target_file = '${esc(file)}'`);
        const dependents = revRes?.rows?.length ? sqlRowsToObjects(revRes) : [];
        const count = dependents.length;
        const risk = count >= 50 ? 'CRITICAL' : count >= 20 ? 'HIGH' : count >= 5 ? 'MEDIUM' : 'LOW';

        return text([
          `# Blast Radius: ${file}`,
          `Risk: **${risk}** (${count} files depend on this)`,
          '',
          risk === 'CRITICAL' ? '⚠️ Only ADD new properties/methods. Do NOT modify existing API.' : '',
          risk === 'HIGH' ? '⚠️ Test exhaustively. Verify public API unchanged.' : '',
          '',
          `## Dependent Files`,
          ...dependents.map((d: any) => `- ${d.source_file || d.sourceFile}`),
        ].join('\n'));
      }

      case 'get_export_info': {
        const exportName = (args as { name: string }).name;
        const [expRes] = await sql(`SELECT * FROM exports WHERE name = '${esc(exportName)}'`);
        if (!expRes?.rows?.length) return text(`Export not found: ${exportName}`);
        const exp = sqlRowsToObjects(expRes)[0] as any;

        // Find usage: infer from parsed import symbols (Spacetime SQL subset does not support LIKE)
        const [importRes] = await sql(`SELECT * FROM symbols WHERE kind = 'import'`);
        const importSymbols = importRes?.rows?.length ? sqlRowsToObjects(importRes) : [];
        const usageFiles = new Set<string>();
        for (const sym of importSymbols as any[]) {
          const importType = String(sym.type_info ?? sym.typeInfo ?? '');
          const importedNames = parseImportedNames(importType);
          if (importedNames.includes(exportName)) {
            const file = String(sym.file_path ?? sym.filePath ?? '');
            if (file) usageFiles.add(file);
          }
        }
        const usages = [...usageFiles];

        let props = '[]', methods = '[]', signals = '[]';
        try { props = JSON.parse(exp.properties || '[]'); } catch { /* */ }
        try { methods = JSON.parse(exp.methods || '[]'); } catch { /* */ }
        try { signals = JSON.parse(exp.signals || '[]'); } catch { /* */ }

        return text([
          `# ${exportName}`,
          `Kind: ${exp.kind} | File: ${exp.file_path || exp.filePath} | Usage: ${exp.usage_count || exp.usageCount}`,
          '',
          `## Properties: ${JSON.stringify(props)}`,
          `## Methods: ${JSON.stringify(methods)}`,
          `## Signals: ${JSON.stringify(signals)}`,
          '',
          `## Used by (${usages.length} files)`,
          ...usages.slice(0, 30).map((file) => `- ${file}`),
        ].join('\n'));
      }

      case 'get_module_overview': {
        const mod = (args as { module: string }).module;
        const [modRes] = await sql(`SELECT * FROM module_summaries WHERE module_name = '${esc(mod)}'`);
        if (!modRes?.rows?.length) return text(`Module not found: ${mod}`);
        const summary = sqlRowsToObjects(modRes)[0] as any;

        const [filesRes] = await sql(`SELECT path, complexity, file_type FROM files WHERE module_name = '${esc(mod)}'`);
        const files = filesRes?.rows?.length ? sqlRowsToObjects(filesRes) : [];

        return text([
          `# Module: ${mod}`,
          `Files: ${summary.file_count || summary.fileCount} | Entry: ${summary.entry_point || summary.entryPoint}`,
          `Key Components: ${summary.key_components || summary.keyComponents}`,
          '',
          `## Files`,
          ...files.map((f: any) => `- ${f.path} (${f.file_type || f.fileType}, ${f.complexity})`),
        ].join('\n'));
      }

      case 'get_framework_info': {
        const [metaRes] = await sql(`SELECT * FROM project_meta`);
        const meta = metaRes?.rows?.length ? sqlRowsToObjects(metaRes) : [];
        const metaMap = Object.fromEntries(meta.map((m: any) => [m.key, m.value]));

        return text([
          `# Project Info`,
          `Name: ${metaMap.name || 'unknown'}`,
          `Languages: ${metaMap.languages || '[]'}`,
          `Framework: ${metaMap.framework || 'none detected'}`,
          `Rules File: ${metaMap.rulesFile || 'AGENTS.md'}`,
          `Last Indexed: ${metaMap.lastIndexed || 'never'}`,
        ].join('\n'));
      }

      // ── Knowledge Management ──

      case 'save_convention': {
        const { area, rule, example, rationale } = args as { area: string; rule: string; example?: string; rationale?: string };
        await callReducer('insert_convention', { area, rule, example: example || '', rationale: rationale || '' });
        return text(`Convention saved: [${area}] ${rule}`);
      }

      case 'get_conventions': {
        const area = (args as { area?: string }).area;
        const query = area ? `SELECT * FROM conventions WHERE area = '${esc(area)}'` : `SELECT * FROM conventions`;
        const [res] = await sql(query);
        const conventions = res?.rows?.length ? sqlRowsToObjects(res) : [];
        return text(conventions.length
          ? conventions.map((c: any) => `- [${c.area}] ${c.rule}${c.example ? ` — e.g. ${c.example}` : ''}`).join('\n')
          : 'No conventions recorded yet.');
      }

      case 'save_decision': {
        const { title, context, decision, consequences, tags } = args as any;
        await callReducer('insert_decision', {
          title, context: context || '', decision, consequences: consequences || '',
          createdAt: BigInt(Date.now()), tags: tags || '',
        });
        return text(`Decision logged: ${title}`);
      }

      case 'annotate_file': {
        const { path: aPath, note, category } = args as { path: string; note: string; category?: string };
        await callReducer('insert_annotation', {
          filePath: aPath, note, createdAt: BigInt(Date.now()), category: category || 'explanation',
        });
        return text(`Annotation added to ${aPath}`);
      }

      case 'get_annotations': {
        const aPath = (args as { path?: string }).path;
        const query = aPath ? `SELECT * FROM annotations WHERE file_path = '${esc(aPath)}'` : `SELECT * FROM annotations`;
        const [res] = await sql(query);
        const annotations = res?.rows?.length ? sqlRowsToObjects(res) : [];
        return text(annotations.length
          ? annotations.map((a: any) => `- [${a.category}] ${a.file_path || a.filePath}: ${a.note}`).join('\n')
          : 'No annotations found.');
      }

      // ── Tasks & Continuity ──

      case 'create_task': {
        const { title, description, context } = args as any;
        const now = BigInt(Date.now());
        await callReducer('insert_task', {
          title, description: description || '', status: 'pending', context: context || '',
          createdAt: now, updatedAt: now,
        });
        return text(`Task created: ${title}`);
      }

      case 'update_task': {
        const { id, status, context } = args as { id: number; status: string; context?: string };
        await callReducer('update_task', {
          id: BigInt(id), status, context: context || '', updatedAt: BigInt(Date.now()),
        });
        return text(`Task ${id} updated → ${status}`);
      }

      case 'get_active_tasks': {
        const [res] = await sql(`SELECT * FROM tasks WHERE status != 'completed'`);
        const tasks = res?.rows?.length ? sqlRowsToObjects(res) : [];
        return text(tasks.length
          ? tasks.map((t: any) => `- [${t.id}] ${t.status}: **${t.title}** — ${t.description || ''}`).join('\n')
          : 'No active tasks.');
      }

      case 'log_change': {
        const { file, changeType, summary, relatedTask } = args as any;
        await callReducer('insert_change', {
          filePath: file, changeType, summary, timestamp: BigInt(Date.now()),
          relatedTask: BigInt(relatedTask || 0),
        });
        return text(`Change logged: ${changeType} ${file}`);
      }

      // ── Analytics ──

      case 'get_project_stats': {
        const [metaRes] = await sql(`SELECT * FROM project_meta`);
        const meta = metaRes?.rows?.length ? sqlRowsToObjects(metaRes) : [];
        const metaMap = Object.fromEntries(meta.map((m: any) => [m.key, m.value]));

        // SpacetimeDB SQL is a subset; GROUP BY is not supported. Aggregate in JS.
        const [filesRes] = await sql(`SELECT file_type, module_name FROM files`);
        const files = filesRes?.rows?.length ? sqlRowsToObjects(filesRes) : [];

        const typeCounts = new Map<string, number>();
        const moduleCounts = new Map<string, number>();

        for (const f of files as any[]) {
          const ft = String(f.file_type ?? f.fileType ?? 'unknown');
          const mn = String(f.module_name ?? f.moduleName ?? 'unknown');
          typeCounts.set(ft, (typeCounts.get(ft) || 0) + 1);
          moduleCounts.set(mn, (moduleCounts.get(mn) || 0) + 1);
        }

        const byType = Array.from(typeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([file_type, cnt]) => ({ file_type, cnt }));

        const byModule = Array.from(moduleCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([module_name, cnt]) => ({ module_name, cnt }));

        return text([
          `# Project Statistics`,
          `Files: ${metaMap.fileCount || '?'} | Symbols: ${metaMap.symbolCount || '?'} | Dependencies: ${metaMap.dependencyCount || '?'}`,
          `Exports: ${metaMap.exportCount || '?'} | Modules: ${metaMap.moduleCount || '?'}`,
          '',
          `## By Type`,
          ...byType.map((t: any) => `- ${t.file_type}: ${t.cnt}`),
          '',
          `## By Module`,
          ...byModule.sort((a: any, b: any) => Number(b.cnt) - Number(a.cnt)).slice(0, 20).map((m: any) => `- ${m.module_name}: ${m.cnt}`),
        ].join('\n'));
      }

      case 'find_hotspots': {
        // Most imported files (aggregate in JS; SpacetimeDB SQL subset has no GROUP BY/ORDER BY)
        const [impRes] = await sql(`SELECT * FROM dependencies`);
        const deps = impRes?.rows?.length ? sqlRowsToObjects(impRes) : [];
        const importCounts = new Map<string, number>();
        for (const d of deps as any[]) {
          const target = String(d.target_file || d.targetFile || 'unknown');
          importCounts.set(target, (importCounts.get(target) || 0) + 1);
        }
        const topImported = Array.from(importCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([target_file, cnt]) => ({ target_file, cnt }));

        // Most used exports (sort in JS)
        const [expRes] = await sql(`SELECT * FROM exports`);
        const topExports = expRes?.rows?.length
          ? sqlRowsToObjects(expRes)
              .sort((a: any, b: any) => Number(b.usage_count || b.usageCount || 0) - Number(a.usage_count || a.usageCount || 0))
              .slice(0, 10)
          : [];

        // Highest complexity
        const [compRes] = await sql(`SELECT path, complexity, size FROM files WHERE complexity = 'high'`);
        const highComplexity = compRes?.rows?.length ? sqlRowsToObjects(compRes).slice(0, 10) : [];

        return text([
          `# Hotspots`,
          '',
          `## Most Imported Files`,
          ...topImported.map((f: any) => `- ${f.target_file} (${f.cnt} imports)`),
          '',
          `## Most Used Exports`,
          ...topExports.map((e: any) => `- ${e.name} (${e.usage_count} usages) — ${e.file_path}`),
          '',
          `## High Complexity Files`,
          ...highComplexity.map((f: any) => `- ${f.path} (${f.size}B)`),
        ].join('\n'));
      }

      case 'get_recent_changes': {
        const limit = (args as { limit?: number }).limit || 20;
        const changes = (await getChangeHistoryRows())
          .sort((a: any, b: any) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
          .slice(0, limit);
        return text(changes.length
          ? changes.map((c: any) => {
              const ts = new Date(Number(c.timestamp)).toISOString();
              return `- [${ts}] ${c.change_type || c.changeType} ${c.file_path || c.filePath}: ${c.summary}`;
            }).join('\n')
          : 'No changes recorded yet.');
      }

      // ── Indexing ──

      case 'reindex_file': {
        const filePath = (args as { path: string }).path;
        const config = await getConfig();
        await reindexFile(filePath, PROJECT_ROOT, config || undefined);
        cache.clear();
        return text(`Reindexed: ${filePath}`);
      }

      case 'reindex_all': {
        const config = await getConfig();
        await indexProject(PROJECT_ROOT, config || undefined);
        cache.clear();
        return text('Full reindex complete.');
      }

      case 'index_status': {
        const [metaRes] = await sql(`SELECT * FROM project_meta`);
        const meta = metaRes?.rows?.length ? sqlRowsToObjects(metaRes) : [];
        const metaMap = Object.fromEntries(meta.map((m: any) => [m.key, m.value]));

        return text([
          `# Index Status`,
          `Last indexed: ${metaMap.lastIndexed || 'never'}`,
          `Files: ${metaMap.fileCount || 0}`,
          `Symbols: ${metaMap.symbolCount || 0}`,
          `Dependencies: ${metaMap.dependencyCount || 0}`,
          `Exports: ${metaMap.exportCount || 0}`,
          `Modules: ${metaMap.moduleCount || 0}`,
        ].join('\n'));
      }

      // ── Power Tools ──

      case 'session_bootstrap': {
        const parts: string[] = ['# Grafeo Session Bootstrap\n'];

        // Project rules
        const config = await getConfig();
        if (config) {
          try {
            const rulesPath = join(PROJECT_ROOT, config.rulesFile);
            const rulesContent = await fsReadFile(rulesPath, 'utf-8');
            parts.push(`## Project Rules (${config.rulesFile})\n${rulesContent.slice(0, 3000)}\n`);
          } catch {
            parts.push(`## Project Rules\nNo ${config.rulesFile} found.\n`);
          }
        }

        // Active tasks
        const [tasksRes] = await sql(`SELECT * FROM tasks WHERE status != 'completed'`);
        const tasks = tasksRes?.rows?.length ? sqlRowsToObjects(tasksRes) : [];
        parts.push(`## Active Tasks (${tasks.length})`);
        for (const t of tasks.slice(0, 10) as any[]) {
          parts.push(`- [${t.id}] ${t.status}: ${t.title}`);
        }

        // Conventions
        const [convRes] = await sql(`SELECT * FROM conventions`);
        const convs = convRes?.rows?.length ? sqlRowsToObjects(convRes) : [];
        parts.push(`\n## Conventions (${convs.length})`);
        for (const c of convs.slice(0, 10) as any[]) {
          parts.push(`- [${c.area}] ${c.rule}`);
        }

        // Index status
        const [metaRes] = await sql(`SELECT * FROM project_meta`);
        const meta = metaRes?.rows?.length ? sqlRowsToObjects(metaRes) : [];
        const metaMap = Object.fromEntries(meta.map((m: any) => [m.key, m.value]));
        parts.push(`\n## Index Status`);
        parts.push(`Files: ${metaMap.fileCount || 0} | Symbols: ${metaMap.symbolCount || 0} | Last: ${metaMap.lastIndexed || 'never'}`);

        // Recent changes
        const changes = (await getChangeHistoryRows())
          .sort((a: any, b: any) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
          .slice(0, 5);
        parts.push(`\n## Recent Changes (${changes.length})`);
        for (const c of changes as any[]) {
          parts.push(`- ${c.change_type || c.changeType} ${c.file_path || c.filePath}: ${c.summary}`);
        }

        return text(parts.join('\n'));
      }

      case 'read_file': {
        const { path: rPath, startLine, endLine } = args as { path: string; startLine?: number; endLine?: number };
        const absolutePath = join(PROJECT_ROOT, rPath);
        const content = await fsReadFile(absolutePath, 'utf-8');
        const lines = content.split('\n');
        const start = (startLine || 1) - 1;
        const end = endLine || lines.length;
        const numbered = lines.slice(start, end).map((line, i) => `${start + i + 1}\t${line}`).join('\n');
        return text(numbered);
      }

      case 'get_project_rules': {
        const config = await getConfig();
        const rulesFile = config?.rulesFile || 'AGENTS.md';
        try {
          const content = await fsReadFile(join(PROJECT_ROOT, rulesFile), 'utf-8');
          const section = (args as { section?: string }).section;
          if (section) {
            const regex = new RegExp(`^##?\\s+.*${section}.*$`, 'mi');
            const match = content.match(regex);
            if (match && match.index !== undefined) {
              const start = match.index;
              const nextSection = content.slice(start + match[0].length).search(/^##?\s+/m);
              const end = nextSection >= 0 ? start + match[0].length + nextSection : content.length;
              return text(content.slice(start, end));
            }
          }
          return text(content);
        } catch {
          return text(`No ${rulesFile} found in project root.`);
        }
      }

      case 'preflight_check': {
        const { intent, files, evidence } = args as { intent: string; files: string[]; evidence?: string };
        const parts: string[] = [`# Preflight Check\nIntent: ${intent}\nEvidence: ${evidence || 'none'}\n`];

        for (const file of files) {
          const [revRes] = await sql(`SELECT source_file FROM dependencies WHERE target_file = '${esc(file)}'`);
          const dependents = revRes?.rows?.length ? sqlRowsToObjects(revRes) : [];
          const count = dependents.length;
          const risk = count >= 50 ? 'CRITICAL' : count >= 20 ? 'HIGH' : count >= 5 ? 'MEDIUM' : 'LOW';

          parts.push(`## ${file} — ${risk} (${count} dependents)`);
          if (count > 0) {
            parts.push(`Dependents: ${dependents.slice(0, 10).map((d: any) => d.source_file || d.sourceFile).join(', ')}`);
          }
        }

        // Relevant conventions
        const [convRes] = await sql(`SELECT * FROM conventions`);
        const convs = convRes?.rows?.length ? sqlRowsToObjects(convRes) : [];
        if (convs.length) {
          parts.push(`\n## Relevant Conventions`);
          for (const c of convs.slice(0, 5) as any[]) {
            parts.push(`- [${c.area}] ${c.rule}`);
          }
        }

        return text(parts.join('\n'));
      }

      case 'find_examples': {
        const { pattern, fileGlob, maxResults, contextLines } = args as any;
        const max = maxResults || 30;
        const ctx = contextLines || 2;

        try {
          let cmd = `grep -rn --include='${fileGlob || '*'}' -C ${ctx} '${pattern.replace(/'/g, "'\\''")}' '${PROJECT_ROOT}'`;
          const output = execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 10000 }).toString();
          const lines = output.split('\n').slice(0, max * (ctx * 2 + 1));
          // Make paths relative
          const result = lines.map(l => l.replace(PROJECT_ROOT + '/', '')).join('\n');
          return text(result || 'No matches found.');
        } catch {
          return text('No matches found.');
        }
      }

      case 'batch_context': {
        const { files: bFiles, exports: bExports } = args as { files?: string[]; exports?: string[] };
        const parts: string[] = ['# Batch Context\n'];

        // File contexts
        if (bFiles?.length) {
          for (const f of bFiles) {
            const [fileRes] = await sql(`SELECT * FROM files WHERE path = '${esc(f)}'`);
            const [symRes] = await sql(`SELECT name, kind, type_info FROM symbols WHERE file_path = '${esc(f)}' AND is_public = true`);
            const [revRes] = await sql(`SELECT source_file FROM dependencies WHERE target_file = '${esc(f)}'`);

            if (fileRes?.rows?.length) {
              const file = sqlRowsToObjects(fileRes)[0] as any;
              const symbols = symRes?.rows?.length ? sqlRowsToObjects(symRes) : [];
              const deps = revRes?.rows?.length ? sqlRowsToObjects(revRes) : [];
              parts.push(`## ${f} (${file.complexity}, ${deps.length} dependents)`);
              parts.push(`Symbols: ${symbols.map((s: any) => `${s.kind}:${s.name}`).join(', ')}`);
            }
          }
        }

        // Export info
        if (bExports?.length) {
          for (const e of bExports) {
            const [expRes] = await sql(`SELECT * FROM exports WHERE name = '${esc(e)}'`);
            if (expRes?.rows?.length) {
              const exp = sqlRowsToObjects(expRes)[0] as any;
              parts.push(`\n## Export: ${e} (${exp.kind}, ${exp.usage_count || exp.usageCount} usages)`);
              parts.push(`File: ${exp.file_path || exp.filePath}`);
            }
          }
        }

        return text(parts.join('\n'));
      }

      case 'postchange_audit': {
        const { changes, validationEvidence } = args as { changes: any[]; validationEvidence?: string };
        const results: string[] = ['# Postchange Audit\n'];

        for (const change of changes) {
          try {
            const config = await getConfig();
            await reindexFile(change.file, PROJECT_ROOT, config || undefined);
            await callReducer('insert_change', {
              filePath: change.file,
              changeType: change.changeType,
              summary: change.summary,
              timestamp: BigInt(Date.now()),
              relatedTask: BigInt(0),
            });
            results.push(`✅ ${change.file}: reindexed + logged (${change.changeType})`);
          } catch (err: any) {
            results.push(`❌ ${change.file}: ${err.message}`);
          }
        }

        if (validationEvidence) {
          results.push(`\nValidation: ${validationEvidence}`);
        }

        cache.clear();
        return text(results.join('\n'));
      }

      default:
        return text(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return text(`Error in ${name}: ${error.message}`);
  }
});

// =============================================================================
// Helpers
// =============================================================================

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function parseImportedNames(typeInfo: string): string[] {
  if (!typeInfo) return [];
  return typeInfo
    .split(',')
    .map(part => part.trim())
    .map(part => part.split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

async function getChangeHistoryRows(): Promise<Record<string, unknown>[]> {
  try {
    const [res] = await sql(`SELECT * FROM change_history`);
    return res?.rows?.length ? sqlRowsToObjects(res) : [];
  } catch {
    const [res] = await sql(`SELECT * FROM changeHistory`);
    return res?.rows?.length ? sqlRowsToObjects(res) : [];
  }
}

// =============================================================================
// Start server
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Grafeo] MCP server running on stdio');
}

main().catch(err => {
  console.error('[Grafeo] Fatal:', err);
  process.exit(1);
});
