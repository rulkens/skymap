/**
 * applyMoves — move a batch of TypeScript source files inside a ts-morph
 * `Project`, letting ts-morph rewrite every relative import that points at
 * (or lives inside) a moved file.
 *
 * ## Why ts-morph owns the rename, not us
 *
 * Skymap's imports are all deep + relative with no barrels (see CLAUDE.md),
 * so moving one file by hand means grepping the whole repo for every
 * `../../utils/foo` that resolves to it and re-deriving each `../` depth by
 * eye — exactly the error-prone busywork an AST tool exists to kill.
 * `SourceFile.move()` re-parses the module graph and rewrites both directions:
 * importers of the moved file *and* the moved file's own imports of files that
 * stayed put. We keep this wrapper deliberately thin — a `for` loop over
 * `move()` — so the interesting behaviour lives in ts-morph and the wrapper
 * stays trivially testable against an in-memory `Project`.
 *
 * ## Why a plain loop rather than one clever call
 *
 * A batch where two moved files import each other still resolves correctly:
 * `move()` updates live references immediately, so by the time the second
 * file moves, the first move's rewrite already accounts for it. Ordering
 * within the batch therefore doesn't matter, which is why the caller can pass
 * an unordered `ReadonlyArray` and why we don't try to topologically sort.
 *
 * The `MovePair` type is co-located here (the `rawDataRegistry.ts` pattern:
 * a small type exported next to the one function that consumes it) rather
 * than spun into its own `@types`-style file — this is `tools/`, and the type
 * only means anything paired with the mover.
 */

import type { Project } from 'ts-morph';

export type MovePair = {
  readonly from: string;
  readonly to: string;
};

export function applyMoves(project: Project, moves: ReadonlyArray<MovePair>): void {
  for (const { from, to } of moves) {
    project.getSourceFileOrThrow(from).move(to);
  }
}
