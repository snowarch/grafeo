// Grafeo TypeScript/JavaScript language plugin

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { LanguagePlugin, ParseResult, Symbol, ImportInfo, ExportInfo } from './base.js';
import { emptyParseResult } from './base.js';

export const typescriptPlugin: LanguagePlugin = {
  name: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],

  async detectProject(root: string): Promise<boolean> {
    const markers = ['package.json', 'tsconfig.json', 'jsconfig.json'];
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
    const isTypeScript = path.endsWith('.ts') || path.endsWith('.tsx');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

      // Imports
      parseImport(trimmed, lineNum, result);

      // Exports
      parseExport(trimmed, lineNum, lines, i, path, result, isTypeScript);

      // Class declarations
      parseClass(trimmed, lineNum, lines, i, path, result);

      // Function declarations (non-exported ones caught here)
      parseFunction(trimmed, lineNum, result);

      // Interface/type declarations (TypeScript)
      if (isTypeScript) {
        parseTypeDeclaration(trimmed, lineNum, result);
      }

      // Variable declarations at module level
      parseVariable(trimmed, lineNum, result);

      // Enum declarations
      parseEnum(trimmed, lineNum, result);

      // Decorator detection
      parseDecorator(trimmed, lineNum, result);
    }

    return result;
  },

  classifyComplexity(content: string): 'low' | 'medium' | 'high' {
    const lineCount = content.split('\n').length;
    const functionCount = (content.match(/(?:function\s+\w+|=>\s*[{(]|\w+\s*\([^)]*\)\s*[:{])/g) || []).length;
    const classCount = (content.match(/\bclass\s+/g) || []).length;
    const importCount = (content.match(/\bimport\s+/g) || []).length;

    if (lineCount > 500 || functionCount > 20 || classCount > 5) return 'high';
    if (lineCount > 200 || functionCount > 8 || classCount > 2 || importCount > 15) return 'medium';
    return 'low';
  },
};

// =============================================================================
// Parsing helpers
// =============================================================================

function parseImport(trimmed: string, lineNum: number, result: ParseResult): void {
  // import X from 'module'
  // import { X, Y } from 'module'
  // import * as X from 'module'
  // import 'module'
  const importMatch = trimmed.match(
    /^import\s+(?:(?:(\w+)|\{([^}]+)\}|\*\s+as\s+(\w+))\s+from\s+)?['"]([^'"]+)['"]/
  );
  if (importMatch) {
    const [, defaultImport, namedImports, namespaceImport, modulePath] = importMatch;
    result.imports.push({
      module: modulePath,
      version: '',
      alias: namespaceImport || '',
    });
    result.symbols.push({
      name: modulePath,
      kind: 'import',
      typeInfo: defaultImport || namedImports?.trim() || namespaceImport || '',
      lineNumber: lineNum,
      isPublic: false,
      description: `Import from "${modulePath}"`,
    });

    // Track usage of imported names as potential export usages
    if (defaultImport) result.exportUsages.push(defaultImport);
    if (namedImports) {
      for (const name of namedImports.split(',')) {
        const clean = name.trim().split(/\s+as\s+/)[0].trim();
        if (clean) result.exportUsages.push(clean);
      }
    }
    if (namespaceImport) result.exportUsages.push(namespaceImport);
  }

  // require() imports
  const requireMatch = trimmed.match(/(?:const|let|var)\s+(?:(\w+)|\{([^}]+)\})\s*=\s*require\(['"]([^'"]+)['"]\)/);
  if (requireMatch) {
    const [, defaultName, namedNames, modulePath] = requireMatch;
    result.imports.push({ module: modulePath, version: '', alias: '' });
    result.symbols.push({
      name: modulePath,
      kind: 'import',
      typeInfo: defaultName || namedNames?.trim() || '',
      lineNumber: lineNum,
      isPublic: false,
      description: `Require "${modulePath}"`,
    });
  }
}

function parseExport(
  trimmed: string, lineNum: number, lines: string[], idx: number,
  path: string, result: ParseResult, _isTypeScript: boolean
): void {
  // export default class/function/expression
  if (trimmed.startsWith('export default ')) {
    const rest = trimmed.slice('export default '.length);
    const classMatch = rest.match(/^class\s+(\w+)/);
    const funcMatch = rest.match(/^function\s+(\w+)/);
    const name = classMatch?.[1] || funcMatch?.[1] || 'default';

    result.symbols.push({
      name,
      kind: classMatch ? 'class' : funcMatch ? 'function' : 'variable',
      typeInfo: 'default export',
      lineNumber: lineNum,
      isPublic: true,
      description: 'Default export',
    });
    return;
  }

  // export class X
  const exportClassMatch = trimmed.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/);
  if (exportClassMatch) {
    const className = exportClassMatch[1];
    const classInfo = extractClassInfo(lines, idx);
    result.symbols.push({
      name: className,
      kind: 'class',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: true,
      description: `Exported class`,
    });
    result.exports.push({
      name: className,
      kind: 'class',
      filePath: path,
      properties: classInfo.properties,
      methods: classInfo.methods,
      signals: [],
      description: `Exported class with ${classInfo.methods.length} methods`,
    });
    return;
  }

  // export function X
  const exportFuncMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
  if (exportFuncMatch) {
    result.symbols.push({
      name: exportFuncMatch[1],
      kind: 'function',
      typeInfo: `(${exportFuncMatch[2]})`,
      lineNumber: lineNum,
      isPublic: true,
      description: 'Exported function',
    });
    return;
  }

  // export const/let/var X
  const exportVarMatch = trimmed.match(/^export\s+(?:const|let|var)\s+(\w+)(?:\s*:\s*(\w[^=]*))?/);
  if (exportVarMatch) {
    result.symbols.push({
      name: exportVarMatch[1],
      kind: 'variable',
      typeInfo: exportVarMatch[2]?.trim() || '',
      lineNumber: lineNum,
      isPublic: true,
      description: 'Exported variable',
    });
    return;
  }

  // export interface X
  const exportInterfaceMatch = trimmed.match(/^export\s+interface\s+(\w+)/);
  if (exportInterfaceMatch) {
    result.symbols.push({
      name: exportInterfaceMatch[1],
      kind: 'interface',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: true,
      description: 'Exported interface',
    });
    return;
  }

  // export type X
  const exportTypeMatch = trimmed.match(/^export\s+type\s+(\w+)/);
  if (exportTypeMatch) {
    result.symbols.push({
      name: exportTypeMatch[1],
      kind: 'type',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: true,
      description: 'Exported type',
    });
    return;
  }

  // export enum X
  const exportEnumMatch = trimmed.match(/^export\s+enum\s+(\w+)/);
  if (exportEnumMatch) {
    result.symbols.push({
      name: exportEnumMatch[1],
      kind: 'enum',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: true,
      description: 'Exported enum',
    });
    return;
  }

  // export { X, Y, Z }
  const reexportMatch = trimmed.match(/^export\s+\{([^}]+)\}/);
  if (reexportMatch) {
    for (const name of reexportMatch[1].split(',')) {
      const clean = name.trim().split(/\s+as\s+/);
      result.symbols.push({
        name: clean[clean.length - 1].trim(),
        kind: 'variable',
        typeInfo: 're-export',
        lineNumber: lineNum,
        isPublic: true,
        description: `Re-exported as ${clean[clean.length - 1].trim()}`,
      });
    }
  }
}

function parseClass(trimmed: string, lineNum: number, lines: string[], idx: number, path: string, result: ParseResult): void {
  // Non-exported class (exported ones handled in parseExport)
  if (trimmed.startsWith('export')) return;
  const classMatch = trimmed.match(/^(?:abstract\s+)?class\s+(\w+)/);
  if (classMatch) {
    const className = classMatch[1];
    const classInfo = extractClassInfo(lines, idx);
    result.symbols.push({
      name: className,
      kind: 'class',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: false,
      description: `Class with ${classInfo.methods.length} methods`,
    });
  }
}

function parseFunction(trimmed: string, lineNum: number, result: ParseResult): void {
  if (trimmed.startsWith('export')) return;
  const funcMatch = trimmed.match(/^(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
  if (funcMatch) {
    result.symbols.push({
      name: funcMatch[1],
      kind: 'function',
      typeInfo: `(${funcMatch[2]})`,
      lineNumber: lineNum,
      isPublic: false,
      description: '',
    });
  }
}

function parseTypeDeclaration(trimmed: string, lineNum: number, result: ParseResult): void {
  if (trimmed.startsWith('export')) return;

  const interfaceMatch = trimmed.match(/^interface\s+(\w+)/);
  if (interfaceMatch) {
    result.symbols.push({
      name: interfaceMatch[1],
      kind: 'interface',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: false,
      description: '',
    });
  }

  const typeMatch = trimmed.match(/^type\s+(\w+)/);
  if (typeMatch) {
    result.symbols.push({
      name: typeMatch[1],
      kind: 'type',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: false,
      description: '',
    });
  }
}

function parseVariable(trimmed: string, lineNum: number, result: ParseResult): void {
  if (trimmed.startsWith('export') || trimmed.startsWith('import')) return;
  // Only top-level const/let/var (heuristic: not indented significantly)
  const varMatch = trimmed.match(/^(?:const|let|var)\s+(\w+)(?:\s*:\s*(\w[^=]*))?/);
  if (varMatch && !trimmed.includes('=>') && !trimmed.includes('require(')) {
    result.symbols.push({
      name: varMatch[1],
      kind: 'variable',
      typeInfo: varMatch[2]?.trim() || '',
      lineNumber: lineNum,
      isPublic: false,
      description: '',
    });
  }
}

function parseEnum(trimmed: string, lineNum: number, result: ParseResult): void {
  if (trimmed.startsWith('export')) return;
  const enumMatch = trimmed.match(/^enum\s+(\w+)/);
  if (enumMatch) {
    result.symbols.push({
      name: enumMatch[1],
      kind: 'enum',
      typeInfo: '',
      lineNumber: lineNum,
      isPublic: false,
      description: '',
    });
  }
}

function parseDecorator(trimmed: string, lineNum: number, result: ParseResult): void {
  const decoratorMatch = trimmed.match(/^@(\w+)(?:\(([^)]*)\))?/);
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

// =============================================================================
// Class analysis helper
// =============================================================================

function extractClassInfo(lines: string[], startIdx: number): { properties: string[]; methods: string[] } {
  const properties: string[] = [];
  const methods: string[] = [];
  let braceDepth = 0;
  let started = false;

  for (let i = startIdx; i < Math.min(startIdx + 200, lines.length); i++) {
    const line = lines[i].trim();

    for (const ch of line) {
      if (ch === '{') { braceDepth++; started = true; }
      if (ch === '}') braceDepth--;
    }

    if (!started) continue;

    // Properties: field declarations
    const propMatch = line.match(/^(?:public|private|protected|readonly|static|#)?\s*(\w+)\s*[?!]?\s*[:=]/);
    if (propMatch && !line.includes('(') && !line.startsWith('//') && !line.startsWith('*')) {
      properties.push(propMatch[1]);
    }

    // Methods
    const methodMatch = line.match(/^(?:public|private|protected|static|async|get|set)?\s*(?:async\s+)?(\w+)\s*\(/);
    if (methodMatch && methodMatch[1] !== 'if' && methodMatch[1] !== 'for' && methodMatch[1] !== 'while'
        && methodMatch[1] !== 'switch' && methodMatch[1] !== 'catch' && methodMatch[1] !== 'constructor') {
      methods.push(methodMatch[1]);
    }

    // Constructor
    if (line.startsWith('constructor(')) {
      methods.push('constructor');
    }

    if (started && braceDepth <= 0) break;
  }

  return { properties: [...new Set(properties)], methods: [...new Set(methods)] };
}
