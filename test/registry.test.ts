import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../src/plugins/registry.js';
import { join } from 'node:path';

const TS_FIXTURE = join(import.meta.dirname, 'fixtures', 'typescript-project');

describe('Plugin Registry', () => {
  const registry = new PluginRegistry();

  it('routes .ts files to TypeScript plugin', () => {
    const plugin = registry.getPluginForFile('src/index.ts');
    expect(plugin.name).toBe('typescript');
  });

  it('routes .py files to Python plugin', () => {
    const plugin = registry.getPluginForFile('src/main.py');
    expect(plugin.name).toBe('python');
  });

  it('routes .tsx files to TypeScript plugin', () => {
    const plugin = registry.getPluginForFile('components/App.tsx');
    expect(plugin.name).toBe('typescript');
  });

  it('routes unknown extensions to generic plugin', () => {
    const plugin = registry.getPluginForFile('README.md');
    expect(plugin.name).toBe('generic');
  });

  it('routes .rs files to generic plugin (no Rust plugin yet)', () => {
    const plugin = registry.getPluginForFile('src/main.rs');
    expect(plugin.name).toBe('generic');
  });

  it('parses files through the correct plugin', () => {
    const content = 'export function hello() { return "world"; }';
    const result = registry.parseFile(content, 'src/index.ts');
    expect(result.symbols.some(s => s.name === 'hello')).toBe(true);
  });

  it('classifies complexity through the correct plugin', () => {
    expect(registry.classifyComplexity('const x = 1;\n', 'file.ts')).toBe('low');
  });

  it('detects languages in a project', async () => {
    const languages = await registry.detectLanguages(TS_FIXTURE);
    expect(languages).toContain('typescript');
  });

  it('lists all plugin names', () => {
    const names = registry.getAllPluginNames();
    expect(names).toContain('typescript');
    expect(names).toContain('python');
    expect(names).not.toContain('generic');
  });
});
