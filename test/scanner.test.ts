import { describe, it, expect } from 'vitest';
import { scanProject } from '../src/indexer/scanner.js';
import { join } from 'node:path';

const TS_FIXTURE = join(import.meta.dirname, 'fixtures', 'typescript-project');
const PY_FIXTURE = join(import.meta.dirname, 'fixtures', 'python-project');

describe('File Scanner', () => {
  it('scans TypeScript project files', async () => {
    const files = await scanProject(TS_FIXTURE);
    expect(files.length).toBeGreaterThan(0);

    const paths = files.map(f => f.path);
    expect(paths.some(p => p.includes('math.ts'))).toBe(true);
    expect(paths.some(p => p.includes('Button.tsx'))).toBe(true);
    expect(paths.some(p => p.includes('api.ts'))).toBe(true);
  });

  it('scans Python project files', async () => {
    const files = await scanProject(PY_FIXTURE);
    expect(files.length).toBeGreaterThan(0);

    const paths = files.map(f => f.path);
    expect(paths.some(p => p.includes('models.py'))).toBe(true);
    expect(paths.some(p => p.includes('views.py'))).toBe(true);
  });

  it('respects ignore patterns', async () => {
    const files = await scanProject(TS_FIXTURE, ['node_modules']);
    const paths = files.map(f => f.path);
    expect(paths.every(p => !p.includes('node_modules'))).toBe(true);
  });

  it('reads file content', async () => {
    const files = await scanProject(TS_FIXTURE, [], ['.ts', '.tsx']);
    const mathFile = files.find(f => f.path.includes('math.ts'));
    expect(mathFile).toBeDefined();
    expect(mathFile!.content).toContain('export function add');
  });

  it('computes content hash', async () => {
    const files = await scanProject(TS_FIXTURE, [], ['.ts']);
    const mathFile = files.find(f => f.path.includes('math.ts'));
    expect(mathFile!.contentHash).toBeTruthy();
    expect(mathFile!.contentHash.length).toBe(16);
  });

  it('detects module names', async () => {
    const files = await scanProject(TS_FIXTURE);
    const mathFile = files.find(f => f.path.includes('math.ts'));
    expect(mathFile!.moduleName).toBe('src/utils');
  });

  it('classifies file types', async () => {
    const files = await scanProject(TS_FIXTURE);
    const tsFile = files.find(f => f.path.endsWith('.ts'));
    expect(tsFile!.fileType).toBe('ts');
    const jsonFile = files.find(f => f.path.endsWith('.json'));
    expect(jsonFile!.fileType).toBe('json');
  });
});
