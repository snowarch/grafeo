// Grafeo file system scanner — walks project directory, reads parseable files

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, extname, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export interface ScannedFile {
  path: string;        // relative to project root
  absolutePath: string;
  moduleName: string;
  fileType: string;
  size: number;
  contentHash: string;
  content: string;
}

const DEFAULT_IGNORE = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv',
  'dist', 'build', 'out', '.next', '.nuxt',
  'target', 'bin', 'obj',
  '.cache', '.tmp', 'coverage',
  '.grafeo', '.idea', '.vscode',
  '.svn', '.hg',
]);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.o',
  '.pyc', '.pyo', '.class',
  '.lock',
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB — skip huge files

export async function scanProject(
  projectRoot: string,
  ignorePatterns: string[] = [],
  parseExtensions: string[] = [],
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  const ignore = new Set([...DEFAULT_IGNORE, ...ignorePatterns]);
  const parseExts = new Set(parseExtensions);

  await walkDir(projectRoot, projectRoot, ignore, parseExts, files);
  return files;
}

async function walkDir(
  currentDir: string,
  projectRoot: string,
  ignore: Set<string>,
  parseExts: Set<string>,
  files: ScannedFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(fullPath, projectRoot, ignore, parseExts, files);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) continue;

    try {
      const fileStat = await stat(fullPath);
      if (fileStat.size > MAX_FILE_SIZE) continue;
      if (fileStat.size === 0) continue;

      // Only read content for parseable extensions (or if no filter set, all text files)
      const shouldParse = parseExts.size === 0 || parseExts.has(ext);
      const content = shouldParse ? await readFile(fullPath, 'utf-8') : '';

      const relativePath = relative(projectRoot, fullPath);
      const moduleName = detectModuleName(relativePath);

      files.push({
        path: relativePath,
        absolutePath: fullPath,
        moduleName,
        fileType: ext.replace('.', '') || 'unknown',
        size: fileStat.size,
        contentHash: createHash('sha256').update(content || relativePath).digest('hex').slice(0, 16),
        content,
      });
    } catch {
      // Skip unreadable files
    }
  }
}

function detectModuleName(relativePath: string): string {
  const parts = relativePath.split('/');

  // Common patterns: src/module/..., packages/module/..., apps/module/..., lib/module/...
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

export function classifyComplexity(content: string): 'low' | 'medium' | 'high' {
  const lineCount = content.split('\n').length;
  if (lineCount > 500) return 'high';
  if (lineCount > 200) return 'medium';
  return 'low';
}
