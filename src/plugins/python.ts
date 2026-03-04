// Grafeo Python language plugin

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { LanguagePlugin, ParseResult, Symbol, ImportInfo, ExportInfo } from './base.js';
import { emptyParseResult } from './base.js';

export const pythonPlugin: LanguagePlugin = {
  name: 'python',
  extensions: ['.py', '.pyi'],

  async detectProject(root: string): Promise<boolean> {
    const markers = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'poetry.lock'];
    for (const marker of markers) {
      try {
        await access(join(root, marker));
        return true;
      } catch { /* not found */ }
    }
    return false;
  },

  parseFile(content: string, path: string): ParseResult {
    const result = emptyParseResult();
    const lines = content.split('\n');
    let currentClass: string | null = null;
    let classIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue;

      // Track class scope
      if (currentClass && indent <= classIndent && trimmed !== '') {
        currentClass = null;
      }

      // Imports
      parseImport(trimmed, lineNum, result);

      // Class declarations
      const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?\s*:/);
      if (classMatch) {
        currentClass = classMatch[1];
        classIndent = indent;
        const bases = classMatch[2] || '';
        const classInfo = extractPythonClass(lines, i, indent);

        result.symbols.push({
          name: classMatch[1],
          kind: 'class',
          typeInfo: bases,
          lineNumber: lineNum,
          isPublic: !classMatch[1].startsWith('_'),
          description: bases ? `Extends ${bases}` : '',
        });

        // If it looks like an important export (not private, at module level)
        if (indent === 0 && !classMatch[1].startsWith('_')) {
          result.exports.push({
            name: classMatch[1],
            kind: 'class',
            filePath: path,
            properties: classInfo.properties,
            methods: classInfo.methods,
            signals: [],
            description: `Class with ${classInfo.methods.length} methods`,
          });
        }
        continue;
      }

      // Function declarations
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\w[^:]*))?\s*:/);
      if (funcMatch) {
        const isMethod = currentClass !== null && indent > classIndent;
        result.symbols.push({
          name: funcMatch[1],
          kind: isMethod ? 'method' : 'function',
          typeInfo: funcMatch[3]?.trim() || '',
          lineNumber: lineNum,
          isPublic: !funcMatch[1].startsWith('_'),
          description: `(${funcMatch[2]})`,
        });
        continue;
      }

      // Variable assignments at module level (potential constants/exports)
      if (indent === 0) {
        const assignMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*[:=]/);
        if (assignMatch) {
          result.symbols.push({
            name: assignMatch[1],
            kind: 'variable',
            typeInfo: 'constant',
            lineNumber: lineNum,
            isPublic: true,
            description: 'Module-level constant',
          });
        }
      }

      // __all__ export list
      const allMatch = trimmed.match(/^__all__\s*=\s*\[([^\]]*)\]/);
      if (allMatch) {
        for (const name of allMatch[1].split(',')) {
          const clean = name.trim().replace(/['"]/g, '');
          if (clean) result.exportUsages.push(clean);
        }
      }

      // Decorator detection
      const decoratorMatch = trimmed.match(/^@(\w+(?:\.\w+)*)(?:\(([^)]*)\))?/);
      if (decoratorMatch) {
        result.symbols.push({
          name: `@${decoratorMatch[1]}`,
          kind: 'decorator',
          typeInfo: decoratorMatch[2] || '',
          lineNumber: lineNum,
          isPublic: false,
          description: `Decorator @${decoratorMatch[1]}`,
        });
      }
    }

    return result;
  },

  classifyComplexity(content: string): 'low' | 'medium' | 'high' {
    const lineCount = content.split('\n').length;
    const defCount = (content.match(/\bdef\s+/g) || []).length;
    const classCount = (content.match(/\bclass\s+/g) || []).length;
    const importCount = (content.match(/\b(?:import|from)\s+/g) || []).length;

    if (lineCount > 500 || defCount > 20 || classCount > 5) return 'high';
    if (lineCount > 200 || defCount > 8 || classCount > 2 || importCount > 15) return 'medium';
    return 'low';
  },
};

// =============================================================================
// Parsing helpers
// =============================================================================

function parseImport(trimmed: string, lineNum: number, result: ParseResult): void {
  // from module import X, Y, Z
  const fromImportMatch = trimmed.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
  if (fromImportMatch) {
    result.imports.push({
      module: fromImportMatch[1],
      version: '',
      alias: '',
    });
    result.symbols.push({
      name: fromImportMatch[1],
      kind: 'import',
      typeInfo: fromImportMatch[2].trim(),
      lineNumber: lineNum,
      isPublic: false,
      description: `Import from ${fromImportMatch[1]}`,
    });

    // Track imported names as export usages
    for (const name of fromImportMatch[2].split(',')) {
      const clean = name.trim().split(/\s+as\s+/)[0].trim();
      if (clean && clean !== '*' && clean !== '(') result.exportUsages.push(clean);
    }
    return;
  }

  // import module [as alias]
  const importMatch = trimmed.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
  if (importMatch) {
    result.imports.push({
      module: importMatch[1],
      version: '',
      alias: importMatch[2] || '',
    });
    result.symbols.push({
      name: importMatch[1],
      kind: 'import',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: false,
      description: `Import ${importMatch[1]}`,
    });
  }
}

function extractPythonClass(lines: string[], startIdx: number, classIndent: number): { properties: string[]; methods: string[] } {
  const properties: string[] = [];
  const methods: string[] = [];

  for (let i = startIdx + 1; i < Math.min(startIdx + 200, lines.length); i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed === '') continue;
    if (indent <= classIndent) break;

    // Methods
    const methodMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
    if (methodMatch) {
      methods.push(methodMatch[1]);
      continue;
    }

    // Class-level attributes (self.X in __init__ or class-level assignments)
    const attrMatch = trimmed.match(/^self\.(\w+)\s*=/);
    if (attrMatch) {
      properties.push(attrMatch[1]);
      continue;
    }

    // Class-level variable
    const classVarMatch = trimmed.match(/^(\w+)\s*[:=]/);
    if (classVarMatch && indent === classIndent + 4) {
      properties.push(classVarMatch[1]);
    }
  }

  return { properties: [...new Set(properties)], methods: [...new Set(methods)] };
}
