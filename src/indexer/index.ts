// Grafeo main indexer — scans project, parses files, populates SpacetimeDB

import { scanProject, type ScannedFile } from './scanner.js';
import { PluginRegistry } from '../plugins/registry.js';
import { callReducer } from '../db.js';
import { loadConfig, type GrafeoConfig } from '../config.js';
import { join, dirname } from 'node:path';

export async function indexProject(projectRoot: string, config?: GrafeoConfig): Promise<void> {
  const cfg = config || await loadConfig(projectRoot);
  if (!cfg) {
    throw new Error(`No Grafeo config found in ${projectRoot}. Run 'grafeo init' first.`);
  }

  const registry = new PluginRegistry();
  const startTime = Date.now();

  console.log(`[Grafeo] Indexing project: ${cfg.name} (${projectRoot})`);
  console.log(`[Grafeo] Languages: ${cfg.languages.join(', ') || 'auto'}`);

  // Step 1: Clear old index data
  console.log('[Grafeo] Clearing old index data...');
  await callReducer('clear_all_index_data', {});

  // Step 2: Store project metadata
  console.log('[Grafeo] Storing project metadata...');
  await callReducer('upsert_project_meta', { key: 'name', value: cfg.name });
  await callReducer('upsert_project_meta', { key: 'root', value: cfg.root });
  await callReducer('upsert_project_meta', { key: 'languages', value: JSON.stringify(cfg.languages) });
  if (cfg.framework) {
    await callReducer('upsert_project_meta', { key: 'framework', value: cfg.framework });
  }
  await callReducer('upsert_project_meta', { key: 'rulesFile', value: cfg.rulesFile });

  // Step 3: Scan files
  console.log('[Grafeo] Scanning files...');
  const files = await scanProject(projectRoot, cfg.ignore, cfg.parseExtensions);
  console.log(`[Grafeo] Found ${files.length} files`);

  // Step 4: Index each file
  let symbolCount = 0;
  let depCount = 0;
  let exportCount = 0;
  const moduleFiles = new Map<string, ScannedFile[]>();
  const allExportUsages = new Map<string, number>();

  for (const file of files) {
    // Register file
    const complexity = file.content
      ? registry.classifyComplexity(file.content, file.path)
      : 'low';

    await callReducer('upsert_file', {
      path: file.path,
      moduleName: file.moduleName,
      fileType: file.fileType,
      size: BigInt(file.size),
      contentHash: file.contentHash,
      lastIndexed: BigInt(Date.now()),
      purpose: '',
      complexity,
    });

    // Track module membership
    if (!moduleFiles.has(file.moduleName)) {
      moduleFiles.set(file.moduleName, []);
    }
    moduleFiles.get(file.moduleName)!.push(file);

    // Parse if we have content
    if (!file.content) continue;

    const parseResult = registry.parseFile(file.content, file.path);

    // Insert symbols
    for (const sym of parseResult.symbols) {
      await callReducer('insert_symbol', {
        filePath: file.path,
        name: sym.name,
        kind: sym.kind,
        typeInfo: sym.typeInfo,
        lineNumber: BigInt(sym.lineNumber),
        isPublic: sym.isPublic,
        description: sym.description,
      });
      symbolCount++;
    }

    // Insert dependencies from imports
    for (const imp of parseResult.imports) {
      const resolvedTarget = resolveImportTarget(imp.module, file.path, files);
      await callReducer('insert_dependency', {
        sourceFile: file.path,
        targetFile: resolvedTarget,
        depType: 'import',
      });
      depCount++;
    }

    // Insert exports
    for (const exp of parseResult.exports) {
      await callReducer('upsert_export', {
        name: exp.name,
        filePath: file.path,
        kind: exp.kind,
        properties: JSON.stringify(exp.properties),
        methods: JSON.stringify(exp.methods),
        signals: JSON.stringify(exp.signals),
        usageCount: BigInt(0),
        description: exp.description,
      });
      exportCount++;
    }

    // Track export usages
    for (const usage of parseResult.exportUsages) {
      allExportUsages.set(usage, (allExportUsages.get(usage) || 0) + 1);
    }

    // Insert custom entries (plugin-specific data)
    for (const entry of parseResult.customEntries) {
      const plugin = registry.getPluginForFile(file.path);
      await callReducer('insert_custom_entry', {
        pluginName: plugin.name,
        entryType: entry.entryType,
        entryKey: entry.entryKey,
        entryValue: entry.entryValue,
        filePath: entry.filePath,
      });
    }
  }

  // Step 5: Update export usage counts
  console.log('[Grafeo] Updating export usage counts...');
  for (const [name, count] of allExportUsages) {
    try {
      await callReducer('upsert_export', {
        name,
        filePath: '',
        kind: 'usage-update',
        properties: '[]',
        methods: '[]',
        signals: '[]',
        usageCount: BigInt(count),
        description: '',
      });
    } catch {
      // Export might not exist (external dependency usage) — skip
    }
  }

  // Step 6: Build module summaries
  console.log('[Grafeo] Building module summaries...');
  for (const [modName, modFiles] of moduleFiles) {
    const keyComponents = modFiles
      .filter(f => f.content && f.size > 500)
      .map(f => f.path)
      .slice(0, 10)
      .join(', ');

    const entryPoint = findEntryPoint(modFiles);

    await callReducer('upsert_module_summary', {
      moduleName: modName,
      fileCount: BigInt(modFiles.length),
      purpose: '',
      keyComponents,
      entryPoint: entryPoint || '',
      relatedModules: '',
    });
  }

  // Step 7: Store index stats
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  await callReducer('upsert_project_meta', { key: 'lastIndexed', value: new Date().toISOString() });
  await callReducer('upsert_project_meta', { key: 'fileCount', value: String(files.length) });
  await callReducer('upsert_project_meta', { key: 'symbolCount', value: String(symbolCount) });
  await callReducer('upsert_project_meta', { key: 'dependencyCount', value: String(depCount) });
  await callReducer('upsert_project_meta', { key: 'exportCount', value: String(exportCount) });
  await callReducer('upsert_project_meta', { key: 'moduleCount', value: String(moduleFiles.size) });

  console.log(`[Grafeo] Indexing complete in ${elapsed}s`);
  console.log(`[Grafeo]   Files: ${files.length}`);
  console.log(`[Grafeo]   Symbols: ${symbolCount}`);
  console.log(`[Grafeo]   Dependencies: ${depCount}`);
  console.log(`[Grafeo]   Exports: ${exportCount}`);
  console.log(`[Grafeo]   Modules: ${moduleFiles.size}`);
}

export async function reindexFile(filePath: string, projectRoot: string, config?: GrafeoConfig): Promise<void> {
  const cfg = config || await loadConfig(projectRoot);
  if (!cfg) throw new Error('No Grafeo config found');

  const registry = new PluginRegistry();
  const { readFile } = await import('node:fs/promises');
  const { stat } = await import('node:fs/promises');
  const { relative, extname } = await import('node:path');
  const { createHash } = await import('node:crypto');

  const absolutePath = join(projectRoot, filePath);
  const fileStat = await stat(absolutePath);
  const content = await readFile(absolutePath, 'utf-8');
  const relPath = relative(projectRoot, absolutePath);

  // Clear old data for this file
  await callReducer('delete_symbols_for_file', { filePath: relPath });
  await callReducer('delete_deps_for_file', { sourceFile: relPath });

  // Re-index file
  const ext = extname(relPath).replace('.', '') || 'unknown';
  const complexity = registry.classifyComplexity(content, relPath);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  await callReducer('upsert_file', {
    path: relPath,
    moduleName: detectModuleName(relPath),
    fileType: ext,
    size: BigInt(fileStat.size),
    contentHash: hash,
    lastIndexed: BigInt(Date.now()),
    purpose: '',
    complexity,
  });

  const parseResult = registry.parseFile(content, relPath);

  for (const sym of parseResult.symbols) {
    await callReducer('insert_symbol', {
      filePath: relPath,
      name: sym.name,
      kind: sym.kind,
      typeInfo: sym.typeInfo,
      lineNumber: BigInt(sym.lineNumber),
      isPublic: sym.isPublic,
      description: sym.description,
    });
  }

  for (const imp of parseResult.imports) {
    await callReducer('insert_dependency', {
      sourceFile: relPath,
      targetFile: imp.module,
      depType: 'import',
    });
  }

  for (const exp of parseResult.exports) {
    await callReducer('upsert_export', {
      name: exp.name,
      filePath: relPath,
      kind: exp.kind,
      properties: JSON.stringify(exp.properties),
      methods: JSON.stringify(exp.methods),
      signals: JSON.stringify(exp.signals),
      usageCount: BigInt(0),
      description: exp.description,
    });
  }

  console.log(`[Grafeo] Reindexed: ${relPath}`);
}

// =============================================================================
// Helpers
// =============================================================================

function resolveImportTarget(importPath: string, sourceFile: string, allFiles: ScannedFile[]): string {
  // If it's a relative import, resolve it
  if (importPath.startsWith('.')) {
    const sourceDir = dirname(sourceFile);
    let resolved = join(sourceDir, importPath).replace(/\\/g, '/');

    // Try common extensions
    const candidates = [
      resolved,
      `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`, `${resolved}.jsx`,
      `${resolved}/index.ts`, `${resolved}/index.tsx`, `${resolved}/index.js`,
      `${resolved}.py`, `${resolved}/__init__.py`,
    ];

    for (const candidate of candidates) {
      if (allFiles.some(f => f.path === candidate)) {
        return candidate;
      }
    }
  }

  // External or unresolved — return as-is
  return importPath;
}

function findEntryPoint(files: ScannedFile[]): string | null {
  const entryNames = ['index.ts', 'index.tsx', 'index.js', 'main.ts', 'main.py', '__init__.py', 'mod.rs', 'lib.rs'];
  for (const name of entryNames) {
    const found = files.find(f => f.path.endsWith(`/${name}`) || f.path === name);
    if (found) return found.path;
  }
  return files[0]?.path || null;
}

function detectModuleName(relativePath: string): string {
  const parts = relativePath.split('/');
  if (parts.length >= 2) {
    const topDir = parts[0];
    if (['src', 'lib', 'app', 'packages', 'apps', 'modules', 'services', 'components'].includes(topDir)) {
      if (parts.length >= 3) return `${topDir}/${parts[1]}`;
      return topDir;
    }
    return topDir;
  }
  return 'root';
}
