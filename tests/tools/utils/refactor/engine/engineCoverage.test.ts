import { afterAll, describe, expect, it } from 'vitest';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { engineHandle } from '../../../../../tools/utils/refactor/engine/engineHandle';
import { closeEngine } from '../../../../../tools/utils/refactor/engine/closeEngine';
import { ENGINE_PROJECTS } from '../../../../../tools/utils/refactor/engine/ENGINE_PROJECTS';
import { openEngine } from '../../../../../tools/utils/refactor/engine/openEngine';

const ROOT = process.cwd();
const GLOBS = [
  'src/**/*.{ts,tsx}',
  'tests/**/*.{ts,tsx}',
  'tools/**/*.{ts,tsx}',
  'packages/*/src/**/*.{ts,tsx,cts}',
  'packages/*/tests/**/*.{ts,tsx}',
  'packages/*/scripts/**/*.{ts,tsx}',
];

describe('engine coverage', () => {
  const engine = openEngine({ root: ROOT, projects: ENGINE_PROJECTS });
  afterAll(() => closeEngine(engine));

  it("every refactor-glob file sits in one of the engine's projects", () => {
    const known = new Set<string>();
    for (const project of engineHandle(engine).snapshot.getProjects())
      for (const name of project.program.getSourceFileNames()) known.add(name.toLowerCase());
    const missing = GLOBS.flatMap((g) => globSync(g, { cwd: ROOT }))
      .map((p) => resolve(ROOT, p))
      .filter((p) => !p.includes('/node_modules/') && !p.includes('/target/'))
      .filter((p) => !known.has(p.toLowerCase()));
    expect(missing).toEqual([]);
  }, 30_000);
});
