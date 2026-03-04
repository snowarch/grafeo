import { describe, it, expect } from 'vitest';
import { detectProject } from '../src/detector.js';
import { join } from 'node:path';

const TS_FIXTURE = join(import.meta.dirname, 'fixtures', 'typescript-project');
const PY_FIXTURE = join(import.meta.dirname, 'fixtures', 'python-project');

describe('Project Detector', () => {
  it('detects TypeScript project', async () => {
    const result = await detectProject(TS_FIXTURE);
    expect(result.languages).toContain('typescript');
    expect(result.projectName).toBe('typescript-project');
  });

  it('detects framework from package.json deps', async () => {
    const result = await detectProject(TS_FIXTURE);
    expect(result.framework).toBe('Next.js');
  });

  it('detects Python project', async () => {
    const result = await detectProject(PY_FIXTURE);
    expect(result.languages).toContain('python');
    expect(result.projectName).toBe('python-project');
  });

  it('detects Flask framework from requirements.txt', async () => {
    const result = await detectProject(PY_FIXTURE);
    expect(result.framework).toBe('Flask');
  });

  it('includes language-specific ignore patterns', async () => {
    const result = await detectProject(TS_FIXTURE);
    expect(result.ignorePatterns).toContain('node_modules');
  });
});
