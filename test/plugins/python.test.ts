import { describe, it, expect } from 'vitest';
import { pythonPlugin } from '../../src/plugins/python.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'python-project');

describe('Python Plugin', () => {
  describe('detectProject', () => {
    it('detects Python project by requirements.txt', async () => {
      expect(await pythonPlugin.detectProject(FIXTURES)).toBe(true);
    });

    it('rejects non-Python project', async () => {
      expect(await pythonPlugin.detectProject('/tmp')).toBe(false);
    });
  });

  describe('parseFile — models.py', () => {
    const content = readFileSync(join(FIXTURES, 'src/models.py'), 'utf-8');
    const result = pythonPlugin.parseFile(content, 'src/models.py');

    it('finds imports', () => {
      const imports = result.symbols.filter(s => s.kind === 'import');
      expect(imports.some(i => i.name === 'dataclasses')).toBe(true);
      expect(imports.some(i => i.name === 'typing')).toBe(true);
      expect(imports.some(i => i.name === 'json')).toBe(true);
    });

    it('finds classes', () => {
      const classes = result.symbols.filter(s => s.kind === 'class');
      expect(classes.some(c => c.name === 'User')).toBe(true);
      expect(classes.some(c => c.name === 'UserRepository')).toBe(true);
    });

    it('finds module-level constants', () => {
      const consts = result.symbols.filter(s => s.kind === 'variable');
      expect(consts.some(c => c.name === 'MAX_NAME_LENGTH')).toBe(true);
      expect(consts.some(c => c.name === 'DEFAULT_STATUS')).toBe(true);
    });

    it('finds methods inside classes', () => {
      const methods = result.symbols.filter(s => s.kind === 'method');
      const methodNames = methods.map(m => m.name);
      expect(methodNames).toContain('is_active');
      expect(methodNames).toContain('to_dict');
      expect(methodNames).toContain('add');
      expect(methodNames).toContain('find_by_email');
    });

    it('extracts class exports with methods', () => {
      const userExport = result.exports.find(e => e.name === 'User');
      expect(userExport).toBeDefined();
      expect(userExport!.kind).toBe('class');
      expect(userExport!.methods).toContain('is_active');
      expect(userExport!.methods).toContain('to_dict');
    });

    it('finds __all__ exports', () => {
      expect(result.exportUsages).toContain('User');
      expect(result.exportUsages).toContain('UserRepository');
      expect(result.exportUsages).toContain('MAX_NAME_LENGTH');
    });

    it('finds decorators', () => {
      const decorators = result.symbols.filter(s => s.kind === 'decorator');
      expect(decorators.some(d => d.name === '@dataclass')).toBe(true);
    });

    it('marks private methods as not public', () => {
      const validate = result.symbols.find(s => s.name === '_validate');
      expect(validate).toBeDefined();
      expect(validate!.isPublic).toBe(false);
    });
  });

  describe('parseFile — views.py', () => {
    const content = readFileSync(join(FIXTURES, 'src/views.py'), 'utf-8');
    const result = pythonPlugin.parseFile(content, 'src/views.py');

    it('finds from-imports', () => {
      const imports = result.symbols.filter(s => s.kind === 'import');
      expect(imports.some(i => i.name === 'flask')).toBe(true);
    });

    it('finds functions', () => {
      const funcs = result.symbols.filter(s => s.kind === 'function');
      expect(funcs.some(f => f.name === 'list_users')).toBe(true);
      expect(funcs.some(f => f.name === 'create_user')).toBe(true);
    });

    it('finds route decorators', () => {
      const decorators = result.symbols.filter(s => s.kind === 'decorator');
      expect(decorators.some(d => d.name === '@app.route')).toBe(true);
    });
  });

  describe('classifyComplexity', () => {
    it('classifies small file as low', () => {
      expect(pythonPlugin.classifyComplexity('x = 1\n')).toBe('low');
    });

    it('classifies large file as high', () => {
      const bigFile = Array(600).fill('x = 1').join('\n');
      expect(pythonPlugin.classifyComplexity(bigFile)).toBe('high');
    });
  });
});
