/**
 * oneSymbolPerFile — CLAUDE.md's per-file export shape, enforced structurally:
 * "every file in src/utils/ exports exactly one function" (the `@types/`
 * half of this rule, including each Layer's own and every tool's, is
 * `typeFilesAreDeclarations.test.ts`). A per-file AST convention like
 * this has no compiler check of its own — `tsc` is happy with ten functions
 * in one file — so it needs a sweep, same spirit as forbiddenPaths.test.ts.
 *
 * ### src/utils
 *
 * The invariant that actually protects filename===export navigability is
 * "AT MOST one function-shaped export": a util file exports its one function,
 * or — for a constants/type/class module — none. What's forbidden is a
 * SECOND function sharing the file, the split that makes the filename stop
 * predicting the symbol. A lone `export const N = 2`, a constants table, or
 * a class is a legitimate zero-function file and passes without an exception;
 * co-located `export const` sizing constants and `export type` input shapes
 * beside the one function are likewise fine. Only files that export MANY
 * functions (a barrel, an underscore-prefixed multi-helper) need exempting,
 * and that list (`utilsFunctionSweepFiles`) is verified empirically against
 * the current tree, not assumed.
 *
 * Enforcing "at most one" rather than "exactly one" is deliberate: the
 * alternative made every constants-only util (`export const N = …`) a
 * hand-maintained exception, so the list grew by one entry every time a
 * sibling constant was added — brittle churn that taught nothing. "At most
 * one function, and the one that exists matches the filename"
 * (filenameMatchesExport.test.ts) is the honest, self-maintaining encoding.
 *
 * What's counted is exported declarations that are function-shaped (a
 * `function` declaration, or a `const` initialised to an arrow/function
 * expression) — see `isFunctionShaped`.
 */
import { describe, it, expect } from 'vitest';
import { exportedDeclarations } from '../helpers/conventions/exportedDeclarations';
import { isFunctionShaped } from '../helpers/conventions/isFunctionShaped';
import { utilsFunctionSweepFiles } from '../helpers/conventions/utilsFunctionSweepFiles';

describe('src/utils: one exported function per file', () => {
  expect(utilsFunctionSweepFiles.length).toBeGreaterThan(0);

  it.each(utilsFunctionSweepFiles)('%s exports at most one function', (file) => {
    const functionNames = [...exportedDeclarations(file).entries()]
      .filter(([, decls]) => decls.some(isFunctionShaped))
      .map(([name]) => name);
    expect(functionNames.length).toBeLessThanOrEqual(1);
  });
});
