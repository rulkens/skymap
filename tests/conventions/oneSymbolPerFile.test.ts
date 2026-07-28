/**
 * oneSymbolPerFile — CLAUDE.md's per-file export shape, enforced structurally:
 * "every file in src/@types/ exports exactly one type" and "every file in
 * src/utils/ exports exactly one function". A per-file AST convention like
 * this has no compiler check of its own — `tsc` is happy with ten types in
 * one file — so it needs a sweep, same spirit as forbiddenPaths.test.ts.
 *
 * ### src/@types
 *
 * The tree is almost entirely `.d.ts` ambient shims (Window augmentations,
 * ambient module ".wesl" declarations, …), which legitimately declare zero
 * or many types — the one-type-per-file rule targets the plain `.ts` files,
 * where a real project `type` lives. Those are asserted to export exactly
 * one symbol, and that symbol must be a `type` alias (not a value, not a
 * second type smuggled in under a different name).
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
 * and that list is verified empirically against the current tree, not
 * assumed.
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
 * expression).
 *
 * ts-morph (already a repo dependency, backing the refactor CLI) does the
 * classification instead of a regex: `getExportedDeclarations()` correctly
 * tells a `FunctionDeclaration` from an arrow-initialised `VariableDeclaration`
 * from a `TypeAliasDeclaration` without hand-rolling a multi-line-aware
 * pattern match, which a constant like
 * `export const X = (a * b) / (c * d)` would trip up (its continuation line
 * starts with `(`, which looks exactly like an arrow function's parameter
 * list to a naive regex).
 */
import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind, type ExportedDeclarations } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return [p];
  });
}

export function isFunctionShaped(decl: ExportedDeclarations): boolean {
  if (decl.getKind() === SyntaxKind.FunctionDeclaration) return true;
  if (decl.getKind() === SyntaxKind.VariableDeclaration) {
    const init = decl.asKindOrThrow(SyntaxKind.VariableDeclaration).getInitializer();
    return (
      init !== undefined &&
      (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression)
    );
  }
  return false;
}

// One shared Project for the whole file — ts-morph parses lazily per file
// added, so this is just a cache, not a full type-checked program.
const project = new Project({ useInMemoryFileSystem: false });

describe('src/@types: one export type per file', () => {
  const files = walk('src/@types').filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  // Sanity check on the sweep itself: if this tree ever became empty (a
  // reorg moved every plain .ts to .d.ts) the it.each below would pass
  // vacuously and silently stop protecting anything.
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s exports exactly one type alias', (file) => {
    const sourceFile = project.addSourceFileAtPath(file);
    const exported = sourceFile.getExportedDeclarations();
    expect(exported.size).toBe(1);
    const decls = [...exported.values()][0]!;
    expect(decls).toHaveLength(1);
    expect(decls[0]!.getKind()).toBe(SyntaxKind.TypeAliasDeclaration);
  });
});

// Files under src/utils/ that export MORE than one function, so "at most one"
// can't apply. Constants-only, class, and single-function files all pass on
// their own and need no entry here — only genuinely multi-function files do.
export const UTILS_MULTI_FUNCTION_FILES: ReadonlySet<string> = new Set([
  // Barrel re-export for src/utils/math (see the file's own header) — every
  // export is a re-export of a sibling file's function, so there is no single
  // function OF this file to name.
  'src/utils/math/index.ts',
  // Underscore-prefixed shared internal helper (its header: "not a public
  // API") — three small cooperating formatting helpers, not a single
  // public function.
  'src/utils/math/_sexagesimal.ts',
]);

describe('src/utils: one exported function per file', () => {
  const files = walk('src/utils')
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !UTILS_MULTI_FUNCTION_FILES.has(f));
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s exports at most one function', (file) => {
    const sourceFile = project.addSourceFileAtPath(file);
    const exported = sourceFile.getExportedDeclarations();
    const functionNames = [...exported.entries()]
      .filter(([, decls]) => decls.some(isFunctionShaped))
      .map(([name]) => name);
    expect(functionNames.length).toBeLessThanOrEqual(1);
  });
});
