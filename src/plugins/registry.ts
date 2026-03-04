// Grafeo plugin registry — discovers and manages language plugins

import { extname } from 'node:path';
import type { LanguagePlugin, ParseResult } from './base.js';
import { emptyParseResult } from './base.js';
import { typescriptPlugin } from './typescript.js';
import { pythonPlugin } from './python.js';
import { genericPlugin } from './generic.js';

export class PluginRegistry {
  private plugins: Map<string, LanguagePlugin> = new Map();
  private extensionMap: Map<string, string> = new Map();

  constructor() {
    // Register built-in plugins
    this.register(typescriptPlugin);
    this.register(pythonPlugin);
    this.register(genericPlugin);
  }

  register(plugin: LanguagePlugin): void {
    this.plugins.set(plugin.name, plugin);
    for (const ext of plugin.extensions) {
      this.extensionMap.set(ext, plugin.name);
    }
  }

  getPluginForFile(filePath: string): LanguagePlugin {
    const ext = extname(filePath).toLowerCase();
    const pluginName = this.extensionMap.get(ext);
    if (pluginName) {
      return this.plugins.get(pluginName)!;
    }
    return genericPlugin;
  }

  parseFile(content: string, filePath: string): ParseResult {
    const plugin = this.getPluginForFile(filePath);
    try {
      return plugin.parseFile(content, filePath);
    } catch {
      return emptyParseResult();
    }
  }

  classifyComplexity(content: string, filePath: string): 'low' | 'medium' | 'high' {
    const plugin = this.getPluginForFile(filePath);
    try {
      return plugin.classifyComplexity(content);
    } catch {
      return 'low';
    }
  }

  async detectLanguages(projectRoot: string): Promise<string[]> {
    const detected: string[] = [];
    for (const [name, plugin] of this.plugins) {
      if (name === 'generic') continue;
      try {
        if (await plugin.detectProject(projectRoot)) {
          detected.push(name);
        }
      } catch { /* skip */ }
    }
    return detected;
  }

  getAllPluginNames(): string[] {
    return [...this.plugins.keys()].filter(n => n !== 'generic');
  }

  getPlugin(name: string): LanguagePlugin | undefined {
    return this.plugins.get(name);
  }
}
