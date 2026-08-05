import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadRefactorProject } from '../../../../tools/utils/refactor/loadRefactorProject';

// Unlike the in-memory Project tests, this one loads the REAL repo on purpose:
// the regression it guards against is the loader silently missing an entire
// tree (e.g. borrowing a tsconfig's own include set, which covers only two of
// the three roots). A synthetic fixture couldn't catch that — only the real
// src/ + tests/ + tools/ layout can. The ~1s load cost is the price of that.
//
// Paths are resolved from process.cwd() (vitest runs at the repo root, the same
// cwd the loader's relative globs assume) rather than from import.meta, so the
// assertion checks the very tree the loader walked.
describe('loadRefactorProject', () => {
  // Legitimately slow: ts-morph parses all three real source trees. ~8s
  // under load — sized ~2.5x that.
  it(
    'loads all three source trees',
    () => {
      const project = loadRefactorProject();
      // getFilePath() returns ts-morph's branded StandardizedFilePath; widen to
      // plain string so the resolve()-based has() checks below type-check.
      const paths = new Set<string>(project.getSourceFiles().map((f) => f.getFilePath()));

      // One known file from each tree — src/, tests/, tools/.
      expect(paths.has(resolve('src/data/galaxyCatalog/galaxyCatalogFormat.ts'))).toBe(true);
      expect(paths.has(resolve('tests/tools/utils/refactor/applyMoves.test.ts'))).toBe(true);
      expect(paths.has(resolve('tools/utils/refactor/applyMoves.ts'))).toBe(true);
    },
    20000,
  );
});
