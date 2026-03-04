// Grafeo project auto-detection — identifies languages, frameworks, and structure

import { readdir, readFile, access } from 'node:fs/promises';
import { join, basename } from 'node:path';

export interface DetectionResult {
  languages: string[];
  framework?: string;
  projectName: string;
  rulesFile: string;
  ignorePatterns: string[];
}

const FRAMEWORK_MARKERS: Record<string, { files?: string[]; deps?: string[]; framework: string }> = {
  nextjs:    { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], deps: ['next'], framework: 'Next.js' },
  nuxtjs:    { files: ['nuxt.config.js', 'nuxt.config.ts'], deps: ['nuxt'], framework: 'Nuxt.js' },
  react:     { deps: ['react', 'react-dom'], framework: 'React' },
  vue:       { files: ['vue.config.js'], deps: ['vue'], framework: 'Vue' },
  svelte:    { files: ['svelte.config.js'], deps: ['svelte'], framework: 'Svelte' },
  angular:   { files: ['angular.json'], deps: ['@angular/core'], framework: 'Angular' },
  django:    { files: ['manage.py'], framework: 'Django' },
  flask:     { deps: ['flask'], framework: 'Flask' },
  fastapi:   { deps: ['fastapi'], framework: 'FastAPI' },
  express:   { deps: ['express'], framework: 'Express' },
  nestjs:    { deps: ['@nestjs/core'], framework: 'NestJS' },
  rails:     { files: ['Gemfile', 'config/routes.rb'], framework: 'Rails' },
  spring:    { files: ['pom.xml', 'build.gradle'], framework: 'Spring' },
};

const RULES_FILES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules', 'CODING_GUIDELINES.md'];

const LANGUAGE_IGNORE: Record<string, string[]> = {
  typescript: ['node_modules', '.next', '.nuxt', 'dist', 'build', 'out', '.turbo'],
  python: ['__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache', 'dist', '*.egg-info'],
  rust: ['target'],
  go: ['vendor'],
  java: ['build', '.gradle', 'target'],
  csharp: ['bin', 'obj', '.vs'],
};

export async function detectProject(root: string): Promise<DetectionResult> {
  const projectName = basename(root);
  const languages: string[] = [];
  let framework: string | undefined;
  let rulesFile = 'AGENTS.md';
  const extraIgnore: string[] = [];

  // Detect languages by marker files
  const langMarkers: Record<string, string[]> = {
    typescript: ['package.json', 'tsconfig.json'],
    python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    rust: ['Cargo.toml'],
    go: ['go.mod'],
    java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    csharp: ['*.csproj', '*.sln'],
  };

  for (const [lang, markers] of Object.entries(langMarkers)) {
    for (const marker of markers) {
      if (marker.includes('*')) {
        // Glob check — scan root for matching files
        try {
          const entries = await readdir(root);
          if (entries.some(e => e.endsWith(marker.replace('*', '')))) {
            if (!languages.includes(lang)) languages.push(lang);
            break;
          }
        } catch { /* skip */ }
      } else {
        try {
          await access(join(root, marker));
          if (!languages.includes(lang)) languages.push(lang);
          break;
        } catch { /* not found */ }
      }
    }
  }

  // Detect framework
  for (const [, info] of Object.entries(FRAMEWORK_MARKERS)) {
    // Check files
    if (info.files) {
      for (const f of info.files) {
        try {
          await access(join(root, f));
          framework = info.framework;
          break;
        } catch { /* not found */ }
      }
      if (framework) break;
    }

    // Check package.json deps
    if (info.deps && languages.includes('typescript')) {
      try {
        const pkgJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf-8'));
        const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
        for (const dep of info.deps) {
          if (allDeps[dep]) {
            framework = info.framework;
            break;
          }
        }
        if (framework) break;
      } catch { /* no package.json */ }
    }

    // Check pyproject.toml/requirements.txt deps
    if (info.deps && languages.includes('python')) {
      try {
        const content = await readFile(join(root, 'requirements.txt'), 'utf-8');
        for (const dep of info.deps) {
          if (content.toLowerCase().includes(dep.toLowerCase())) {
            framework = info.framework;
            break;
          }
        }
        if (framework) break;
      } catch { /* no requirements.txt */ }
    }
  }

  // Detect rules file
  for (const candidate of RULES_FILES) {
    try {
      await access(join(root, candidate));
      rulesFile = candidate;
      break;
    } catch { /* not found */ }
  }

  // Collect ignore patterns for detected languages
  for (const lang of languages) {
    const patterns = LANGUAGE_IGNORE[lang];
    if (patterns) {
      for (const p of patterns) {
        if (!extraIgnore.includes(p)) extraIgnore.push(p);
      }
    }
  }

  return {
    languages,
    framework,
    projectName,
    rulesFile,
    ignorePatterns: extraIgnore,
  };
}
