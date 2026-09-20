/**
 * oneSymbolPerFile — CLAUDE.md's per-file export shape, enforced structurally:
 * "every file in src/@types/ exports exactly one type" and "every file in
 * src/utils/ exports exactly one function". A per-file AST convention like
 * this has no compiler check of its own — `tsc` is happy with ten types in
 * one file — so it needs a sweep, same spirit as forbiddenPaths.test.ts.
 *
 * ### src/@types (and each Layer's own @types/ under src/layers)
 *
 * The tree is almost entirely `.d.ts` ambient shims (Window augmentations,
 * ambient module ".wesl" declarations, …), which legitimately declare zero
 * or many types — the one-type-per-file rule targets the plain `.ts` files,
 * where a real project `type` lives. Those are asserted to export exactly
 * one symbol, and that symbol must be a `type` alias (not a value, not a
 * second type smuggled in under a different name). A Layer's own contract
 * types live in its `@types/` folder (CLAUDE.md), the same role as
 * `src/@types/` for core/shared types, so the sweep walks both.
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
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SyntaxKind } from 'ts-morph';
import { exportedDeclarations } from '../helpers/conventions/exportedDeclarations';
import { isFunctionShaped } from '../helpers/conventions/isFunctionShaped';
import { utilsFunctionSweepFiles } from '../helpers/conventions/utilsFunctionSweepFiles';
import { walkFiles } from '../helpers/conventions/walkFiles';

// Each Layer that owns contract types puts them in its own `@types/` folder
// (CLAUDE.md), sibling to — not a child of — src/@types; found by scanning
// src/layers/* rather than hand-listed, so a new Layer's @types/ is swept
// automatically instead of silently falling outside the ratchet.
const layerTypesDirs = readdirSync('src/layers').flatMap((name) => {
  const dir = join('src/layers', name, '@types');
  try {
    return statSync(dir).isDirectory() ? [dir] : [];
  } catch {
    return [];
  }
});

describe('src/@types: one export type per file', () => {
  const files = [
    ...walkFiles('src/@types', ['.ts']),
    ...layerTypesDirs.flatMap((dir) => walkFiles(dir, ['.ts'])),
  ].filter((f) => !f.endsWith('.d.ts'));
  // Sanity check on the sweep itself: if this tree ever became empty (a
  // reorg moved every plain .ts to .d.ts) the it.each below would pass
  // vacuously and silently stop protecting anything.
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s exports exactly one type alias', (file) => {
    const exported = exportedDeclarations(file);
    expect(exported.size).toBe(1);
    const decls = [...exported.values()][0]!;
    expect(decls).toHaveLength(1);
    expect(decls[0]!.getKind()).toBe(SyntaxKind.TypeAliasDeclaration);
  });
});

describe('src/utils: one exported function per file', () => {
  expect(utilsFunctionSweepFiles.length).toBeGreaterThan(0);

  it.each(utilsFunctionSweepFiles)('%s exports at most one function', (file) => {
    const functionNames = [...exportedDeclarations(file).entries()]
      .filter(([, decls]) => decls.some(isFunctionShaped))
      .map(([name]) => name);
    expect(functionNames.length).toBeLessThanOrEqual(1);
  });
});
