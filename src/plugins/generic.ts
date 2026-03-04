// Grafeo generic/fallback language plugin — works for any file type

import type { LanguagePlugin, ParseResult } from './base.js';
import { emptyParseResult } from './base.js';

export const genericPlugin: LanguagePlugin = {
  name: 'generic',
  extensions: [],  // Matches anything not handled by other plugins

  async detectProject(): Promise<boolean> {
    return true;  // Always available as fallback
  },

  parseFile(content: string, path: string): ParseResult {
    const result = emptyParseResult();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const lineNum = i + 1;

      // Generic import patterns
      // #include "file.h" / #include <file.h>
      const includeMatch = trimmed.match(/^#include\s+[<"]([^>"]+)[>"]/);
      if (includeMatch) {
        result.imports.push({ module: includeMatch[1], version: '', alias: '' });
        result.symbols.push({
          name: includeMatch[1],
          kind: 'import',
          typeInfo: '',
          lineNumber: lineNum,
          isPublic: false,
          description: `Include ${includeMatch[1]}`,
        });
      }

      // use module::path (Rust)
      const useMatch = trimmed.match(/^use\s+([\w:]+)/);
      if (useMatch) {
        result.imports.push({ module: useMatch[1], version: '', alias: '' });
        result.symbols.push({
          name: useMatch[1],
          kind: 'import',
          typeInfo: '',
          lineNumber: lineNum,
          isPublic: false,
          description: `Use ${useMatch[1]}`,
        });
      }

      // package X / import "path" (Go)
      const goImportMatch = trimmed.match(/^import\s+"([^"]+)"/);
      if (goImportMatch) {
        result.imports.push({ module: goImportMatch[1], version: '', alias: '' });
      }

      // Generic function-like patterns
      const funcMatch = trimmed.match(/^(?:pub\s+)?(?:async\s+)?(?:fn|func|fun|def|function|sub)\s+(\w+)/);
      if (funcMatch) {
        result.symbols.push({
          name: funcMatch[1],
          kind: 'function',
          typeInfo: '',
          lineNumber: lineNum,
          isPublic: trimmed.startsWith('pub ') || !funcMatch[1].startsWith('_'),
          description: '',
        });
      }

      // Generic struct/class/type patterns
      const typeMatch = trimmed.match(/^(?:pub\s+)?(?:struct|class|trait|interface|type|enum)\s+(\w+)/);
      if (typeMatch) {
        result.symbols.push({
          name: typeMatch[1],
          kind: 'class',
          typeInfo: '',
          lineNumber: lineNum,
          isPublic: trimmed.startsWith('pub ') || !typeMatch[1].startsWith('_'),
          description: '',
        });
      }
    }

    return result;
  },

  classifyComplexity(content: string): 'low' | 'medium' | 'high' {
    const lineCount = content.split('\n').length;
    if (lineCount > 500) return 'high';
    if (lineCount > 200) return 'medium';
    return 'low';
  },
};
