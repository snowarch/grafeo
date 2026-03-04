// Grafeo project configuration manager

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const GRAFEO_DIR = '.grafeo';
export const CONFIG_FILE = 'config.json';

export interface GrafeoConfig {
  name: string;
  root: string;
  languages: string[];
  framework?: string;
  ignore: string[];
  parseExtensions: string[];
  rulesFile: string;
  spacetimedb: {
    url: string;
    database: string;
  };
  plugins: Record<string, { enabled: boolean; options?: Record<string, unknown> }>;
}

export function defaultConfig(projectRoot: string, projectName: string): GrafeoConfig {
  return {
    name: projectName,
    root: projectRoot,
    languages: [],
    ignore: [
      '.git', 'node_modules', '__pycache__', '.venv', 'venv',
      'dist', 'build', 'out', '.next', '.nuxt',
      'target', 'bin', 'obj',
      '.cache', '.tmp', 'coverage',
      '.grafeo',
    ],
    parseExtensions: [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.pyi',
      '.rs',
      '.go',
      '.java', '.kt', '.kts',
      '.cs',
      '.qml',
      '.json', '.yaml', '.yml', '.toml',
      '.md', '.mdx',
      '.sh', '.bash',
      '.css', '.scss', '.less',
      '.html', '.vue', '.svelte',
    ],
    rulesFile: 'AGENTS.md',
    spacetimedb: {
      url: process.env.SPACETIMEDB_URL || 'http://127.0.0.1:3000',
      database: process.env.SPACETIMEDB_DB || sanitizeDbName(projectName),
    },
    plugins: {},
  };
}

function sanitizeDbName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 64);
}

export async function loadConfig(projectRoot: string): Promise<GrafeoConfig | null> {
  const configPath = join(projectRoot, GRAFEO_DIR, CONFIG_FILE);
  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as GrafeoConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(projectRoot: string, config: GrafeoConfig): Promise<void> {
  const grafeoDir = join(projectRoot, GRAFEO_DIR);
  await mkdir(grafeoDir, { recursive: true });
  const configPath = join(grafeoDir, CONFIG_FILE);
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function resolveProjectRoot(pathArg?: string): string {
  if (pathArg) return resolve(pathArg);
  return process.cwd();
}
