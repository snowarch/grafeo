#!/usr/bin/env node
// Grafeo CLI — init, index, serve, setup, status

import { resolve, join, basename } from 'node:path';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { detectProject } from './detector.js';
import { defaultConfig, saveConfig, loadConfig, GRAFEO_DIR } from './config.js';
import { indexProject } from './indexer/index.js';
import { PluginRegistry } from './plugins/registry.js';

const HELP = `
Grafeo — Deep code intelligence for AI agents

Usage:
  grafeo init [path]         Initialize Grafeo in a project (auto-detects language)
  grafeo index [path]        Index the project (scan files, build knowledge graph)
  grafeo serve               Start MCP server (stdio transport for AI IDEs)
  grafeo setup <ide>         Configure MCP for your IDE (windsurf|cursor|claude)
  grafeo status [path]       Check index status
  grafeo help                Show this help

Environment:
  SPACETIMEDB_URL            SpacetimeDB URL (default: http://127.0.0.1:3000)
  SPACETIMEDB_DB             Database name (default: auto from project name)
  GRAFEO_PROJECT_ROOT        Project root override
`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  switch (command) {
    case 'init':
      await cmdInit(rest[0]);
      break;
    case 'index':
      await cmdIndex(rest[0]);
      break;
    case 'serve':
      await cmdServe();
      break;
    case 'setup':
      await cmdSetup(rest[0]);
      break;
    case 'status':
      await cmdStatus(rest[0]);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

// =============================================================================
// Commands
// =============================================================================

async function cmdInit(pathArg?: string) {
  const projectRoot = resolve(pathArg || '.');
  console.log(`\n🔍 Detecting project at ${projectRoot}...\n`);

  // Check if already initialized
  const existing = await loadConfig(projectRoot);
  if (existing) {
    console.log(`⚠️  Grafeo already initialized in ${projectRoot}`);
    console.log(`   Config: ${join(projectRoot, GRAFEO_DIR, 'config.json')}`);
    console.log(`   Run 'grafeo index' to re-index.\n`);
    return;
  }

  // Auto-detect
  const detection = await detectProject(projectRoot);
  const registry = new PluginRegistry();
  const detectedLangs = await registry.detectLanguages(projectRoot);

  // Merge detected languages
  const languages = [...new Set([...detection.languages, ...detectedLangs])];

  console.log(`  Project:    ${detection.projectName}`);
  console.log(`  Languages:  ${languages.join(', ') || 'none detected'}`);
  console.log(`  Framework:  ${detection.framework || 'none detected'}`);
  console.log(`  Rules file: ${detection.rulesFile}`);
  console.log('');

  // Create config
  const config = defaultConfig(projectRoot, detection.projectName);
  config.languages = languages;
  config.framework = detection.framework;
  config.rulesFile = detection.rulesFile;

  // Merge extra ignore patterns
  for (const p of detection.ignorePatterns) {
    if (!config.ignore.includes(p)) config.ignore.push(p);
  }

  // Enable detected plugins
  for (const lang of languages) {
    config.plugins[lang] = { enabled: true };
  }

  await saveConfig(projectRoot, config);

  // Create .gitignore for .grafeo dir
  const gitignorePath = join(projectRoot, GRAFEO_DIR, '.gitignore');
  await writeFile(gitignorePath, '# Grafeo local state\nconfig.json\n', 'utf-8');

  console.log(`📝 Created ${join(GRAFEO_DIR, 'config.json')}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Start SpacetimeDB:  spacetime start`);
  console.log(`  2. Publish module:     spacetime publish ${config.spacetimedb.database} --module-path ./spacetimedb`);
  console.log(`  3. Index project:      grafeo index`);
  console.log(`  4. Setup IDE:          grafeo setup windsurf`);
  console.log('');
}

async function cmdIndex(pathArg?: string) {
  const projectRoot = resolve(pathArg || '.');
  const config = await loadConfig(projectRoot);

  if (!config) {
    console.error(`❌ No Grafeo config found in ${projectRoot}`);
    console.error(`   Run 'grafeo init' first.\n`);
    process.exit(1);
  }

  console.log(`\n📦 Indexing ${config!.name}...\n`);
  await indexProject(projectRoot, config!);
  console.log('\n✅ Indexing complete!\n');
}

async function cmdServe() {
  // Dynamically import and run the MCP server
  await import('./mcp-server.js');
}

async function cmdSetup(ide?: string) {
  if (!ide) {
    console.error('Usage: grafeo setup <ide>');
    console.error('Supported IDEs: windsurf, cursor, claude\n');
    process.exit(1);
  }

  const projectRoot = resolve('.');
  const config = await loadConfig(projectRoot);
  const dbName = config?.spacetimedb.database || 'grafeo';

  const packageServerPath = join(projectRoot, 'node_modules', 'grafeo-mcp', 'dist', 'mcp-server.js');
  const packageMcpConfig = {
    command: 'npx',
    args: ['-y', 'grafeo-mcp'],
    env: {
      GRAFEO_PROJECT_ROOT: projectRoot,
      SPACETIMEDB_DB: dbName,
    },
  };

  // If running from source (dev mode)
  const devServerPath = join(projectRoot, 'src', 'mcp-server.ts');
  const devMcpConfig = {
    command: 'npx',
    args: ['tsx', devServerPath],
    env: {
      GRAFEO_PROJECT_ROOT: projectRoot,
      SPACETIMEDB_DB: dbName,
    },
  };

  const useDev = await pathExists(devServerPath);
  const forceDev = process.env.GRAFEO_SETUP_DEV === '1';
  const selectedConfig = forceDev && useDev ? devMcpConfig : packageMcpConfig;

  const serverName = `grafeo-${config?.name || 'project'}`;

  switch (ide!.toLowerCase()) {
    case 'windsurf': {
      const configDir = join(process.env.HOME || '~', '.codeium', 'windsurf');
      const configFile = join(configDir, 'mcp_config.json');
      await mergeJsonConfig(configFile, serverName, selectedConfig);
      console.log(`\n✅ Windsurf MCP configured: ${configFile}`);
      console.log(`   Server name: ${serverName}\n`);
      break;
    }
    case 'cursor': {
      const configFile = join(projectRoot, '.cursor', 'mcp.json');
      await mergeJsonConfig(configFile, serverName, selectedConfig);
      console.log(`\n✅ Cursor MCP configured: ${configFile}`);
      console.log(`   Server name: ${serverName}\n`);
      break;
    }
    case 'claude': {
      const configFile = join(projectRoot, '.claude', 'mcp.json');
      await mergeJsonConfig(configFile, serverName, selectedConfig);
      console.log(`\n✅ Claude MCP configured: ${configFile}`);
      console.log(`   Server name: ${serverName}\n`);
      break;
    }
    default:
      console.error(`Unknown IDE: ${ide}. Supported: windsurf, cursor, claude\n`);
      process.exit(1);
  }
}

async function cmdStatus(pathArg?: string) {
  const projectRoot = resolve(pathArg || '.');
  const config = await loadConfig(projectRoot);

  if (!config) {
    console.log(`\n❌ Grafeo not initialized in ${projectRoot}`);
    console.log(`   Run 'grafeo init' first.\n`);
    return;
  }

  console.log(`\n📊 Grafeo Status: ${config.name}`);
  console.log(`   Root:       ${config.root}`);
  console.log(`   Languages:  ${config.languages.join(', ')}`);
  console.log(`   Framework:  ${config.framework || 'none'}`);
  console.log(`   DB:         ${config.spacetimedb.database}`);
  console.log(`   DB URL:     ${config.spacetimedb.url}`);

  // Try to query SpacetimeDB for index status
  try {
    const { sql, sqlRowsToObjects } = await import('./db.js');
    const [metaRes] = await sql(`SELECT * FROM project_meta`);
    const meta = metaRes?.rows?.length ? sqlRowsToObjects(metaRes) : [];
    const metaMap = Object.fromEntries(meta.map((m: any) => [m.key, m.value]));

    console.log(`\n   📦 Index:`);
    console.log(`   Files:      ${metaMap.fileCount || 0}`);
    console.log(`   Symbols:    ${metaMap.symbolCount || 0}`);
    console.log(`   Deps:       ${metaMap.dependencyCount || 0}`);
    console.log(`   Exports:    ${metaMap.exportCount || 0}`);
    console.log(`   Modules:    ${metaMap.moduleCount || 0}`);
    console.log(`   Last index: ${metaMap.lastIndexed || 'never'}`);
  } catch {
    console.log(`\n   ⚠️  Cannot reach SpacetimeDB at ${config.spacetimedb.url}`);
    console.log(`      Run 'spacetime start' first.`);
  }
  console.log('');
}

// =============================================================================
// Helpers
// =============================================================================

async function mergeJsonConfig(
  configFile: string,
  serverName: string,
  mcpConfig: Record<string, unknown>
): Promise<void> {
  const dir = join(configFile, '..');
  await mkdir(dir, { recursive: true });

  let existing: any = { mcpServers: {} };
  try {
    const content = await readFile(configFile, 'utf-8');
    existing = JSON.parse(content);
  } catch { /* file doesn't exist */ }

  if (!existing.mcpServers) existing.mcpServers = {};
  existing.mcpServers[serverName] = mcpConfig;

  await writeFile(configFile, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
