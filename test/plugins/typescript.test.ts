import { describe, it, expect } from 'vitest';
import { typescriptPlugin } from '../../src/plugins/typescript.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'typescript-project');

describe('TypeScript Plugin', () => {
  describe('detectProject', () => {
    it('detects TypeScript project by package.json', async () => {
      expect(await typescriptPlugin.detectProject(FIXTURES)).toBe(true);
    });

    it('rejects non-TypeScript project', async () => {
      expect(await typescriptPlugin.detectProject('/tmp')).toBe(false);
    });
  });

  describe('parseFile — math.ts', () => {
    const content = readFileSync(join(FIXTURES, 'src/utils/math.ts'), 'utf-8');
    const result = typescriptPlugin.parseFile(content, 'src/utils/math.ts');

    it('finds exported functions', () => {
      const funcs = result.symbols.filter(s => s.kind === 'function' && s.isPublic);
      const names = funcs.map(f => f.name);
      expect(names).toContain('add');
      expect(names).toContain('multiply');
    });

    it('finds exported constants', () => {
      const vars = result.symbols.filter(s => s.kind === 'variable' && s.isPublic);
      expect(vars.some(v => v.name === 'PI')).toBe(true);
    });

    it('finds exported interfaces', () => {
      const ifaces = result.symbols.filter(s => s.kind === 'interface' && s.isPublic);
      expect(ifaces.some(i => i.name === 'MathResult')).toBe(true);
    });

    it('finds exported types', () => {
      const types = result.symbols.filter(s => s.kind === 'type' && s.isPublic);
      expect(types.some(t => t.name === 'NumberPair')).toBe(true);
    });
  });

  describe('parseFile — Button.tsx', () => {
    const content = readFileSync(join(FIXTURES, 'src/components/Button.tsx'), 'utf-8');
    const result = typescriptPlugin.parseFile(content, 'src/components/Button.tsx');

    it('finds imports', () => {
      const imports = result.symbols.filter(s => s.kind === 'import');
      expect(imports.length).toBeGreaterThanOrEqual(2);
      expect(imports.some(i => i.name === 'react')).toBe(true);
    });

    it('finds exported interface', () => {
      const ifaces = result.symbols.filter(s => s.kind === 'interface' && s.isPublic);
      expect(ifaces.some(i => i.name === 'ButtonProps')).toBe(true);
    });

    it('finds exported class', () => {
      const classes = result.symbols.filter(s => s.kind === 'class' && s.isPublic);
      expect(classes.some(c => c.name === 'ButtonState')).toBe(true);
    });

    it('extracts class as export with methods', () => {
      const exp = result.exports.find(e => e.name === 'ButtonState');
      expect(exp).toBeDefined();
      expect(exp!.methods).toContain('increment');
      expect(exp!.methods).toContain('reset');
    });

    it('detects default export', () => {
      const defaultExport = result.symbols.find(s => s.name === 'Button' || (s.typeInfo === 'default export'));
      expect(defaultExport).toBeDefined();
    });

    it('tracks export usages from imports', () => {
      expect(result.exportUsages).toContain('React');
      expect(result.exportUsages).toContain('add');
    });
  });

  describe('parseFile — api.ts', () => {
    const content = readFileSync(join(FIXTURES, 'src/services/api.ts'), 'utf-8');
    const result = typescriptPlugin.parseFile(content, 'src/services/api.ts');

    it('finds exported async function', () => {
      const funcs = result.symbols.filter(s => s.kind === 'function' && s.isPublic);
      expect(funcs.some(f => f.name === 'fetchResult')).toBe(true);
    });

    it('finds exported class with methods', () => {
      const exp = result.exports.find(e => e.name === 'ApiClient');
      expect(exp).toBeDefined();
      expect(exp!.kind).toBe('class');
      expect(exp!.methods).toContain('get');
      expect(exp!.methods).toContain('post');
    });

    it('finds exported enum', () => {
      const enums = result.symbols.filter(s => s.kind === 'enum' && s.isPublic);
      expect(enums.some(e => e.name === 'HttpMethod')).toBe(true);
    });

    it('detects import dependency', () => {
      expect(result.imports.some(i => i.module === '../utils/math')).toBe(true);
    });
  });

  describe('classifyComplexity', () => {
    it('classifies small file as low', () => {
      expect(typescriptPlugin.classifyComplexity('const x = 1;\n')).toBe('low');
    });

    it('classifies large file as high', () => {
      const bigFile = Array(600).fill('const x = 1;').join('\n');
      expect(typescriptPlugin.classifyComplexity(bigFile)).toBe('high');
    });
  });
});
