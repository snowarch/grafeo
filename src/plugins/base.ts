// Grafeo language plugin interface

export interface Symbol {
  name: string;
  kind: string;  // 'function' | 'class' | 'interface' | 'type' | 'variable' | 'property' | 'method' | 'signal' | 'import' | 'component' | 'decorator' | 'enum'
  typeInfo: string;
  lineNumber: number;
  isPublic: boolean;
  description: string;
}

export interface ImportInfo {
  module: string;
  version: string;
  alias: string;
}

export interface ExportInfo {
  name: string;
  kind: string;  // 'class' | 'function' | 'const' | 'singleton' | 'service' | 'interface' | 'type' | 'enum'
  filePath: string;
  properties: string[];
  methods: string[];
  signals: string[];
  description: string;
}

export interface CustomEntry {
  entryType: string;
  entryKey: string;
  entryValue: string;
  filePath: string;
}

export interface ParseResult {
  symbols: Symbol[];
  imports: ImportInfo[];
  exportUsages: string[];
  exports: ExportInfo[];
  customEntries: CustomEntry[];
}

export interface LanguagePlugin {
  name: string;
  extensions: string[];

  // Detection: does this repo use this language?
  detectProject(root: string): Promise<boolean>;

  // Parsing
  parseFile(content: string, path: string): ParseResult;
  classifyComplexity(content: string): 'low' | 'medium' | 'high';
}

// Helper to create an empty parse result
export function emptyParseResult(): ParseResult {
  return {
    symbols: [],
    imports: [],
    exportUsages: [],
    exports: [],
    customEntries: [],
  };
}
