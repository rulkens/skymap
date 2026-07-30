/**
 * planMove — the shared move orchestration behind both `npm run move-files` and
 * `refactor move`: expand a raw list of file moves to drag their test mirrors,
 * then apply the whole batch inside a ts-morph `Project`.
 *
 * ## Why one function for two entrypoints
 *
 * The move behaviour used to live inline in `moveFiles.ts`. Folding `move` into
 * the `refactor` CLI (Q8 option B) would otherwise mean a second copy of the
 * same expand→apply sequence. Extracting it here makes `moveFiles.ts` a thin
 * alias with no behaviour change: both callers hand over the raw pairs the user
 * asked for and get back the expanded plan (originals first, mirror moves
 * appended) that ts-morph has already applied to the project.
 *
 * ## Why `fileExists` is a parameter
 *
 * The mirror expansion needs an existence oracle — a source file may or may not
 * have a `tests/` twin, and the twin's suffix (`.test.ts` vs `.test.tsx`) is not
 * mechanically derivable (see `expandTestMirrors`). Both real callers probe the
 * actual filesystem (`existsSync`), so this could have statted disk internally.
 * We take the predicate as a parameter instead so the unit test can drive it
 * from an in-memory stub without a real tree on disk. That is the same reason
 * `expandTestMirrors` injects it — and it is a deliberate contrast with
 * `planRename`/`planDelete`, which use the `Project`'s own file set as their
 * mirror oracle; `move` predates the CLI and its contract is the real disk.
 *
 * ## Why paths are resolved to absolute before applying
 *
 * The mirror expansion has to run on the RELATIVE pairs the user typed —
 * `expandTestMirrors` keys off the `src/`/`tools/` prefix to find the `tests/`
 * twin — but `SourceFile.move(relativePath)` resolves a relative destination
 * against the moved file's OWN directory, not the filesystem root, so applying
 * the raw pairs would drop each file into a doubled path
 * (`src/utils/math/src/helpers/…`). We therefore resolve every pair against the
 * project filesystem's current directory just before `applyMoves`: that base is
 * the repo root for the real CLI and `/` for an in-memory test project, so the
 * absolute targets line up in both frames without a caller-supplied resolver.
 * The RELATIVE pairs are what we return, so the `move-files` preview keeps
 * echoing the paths the user typed.
 */

import { resolve } from 'node:path';
import type { Project } from 'ts-morph';
import type { MovePair } from './applyMoves';
import { applyMoves } from './applyMoves';
import { expandTestMirrors } from './expandTestMirrors';

export function planMove(
  project: Project,
  moves: ReadonlyArray<MovePair>,
  fileExists: (path: string) => boolean,
): MovePair[] {
  const expanded = expandTestMirrors(moves, fileExists);
  const cwd = project.getFileSystem().getCurrentDirectory();
  applyMoves(
    project,
    expanded.map(({ from, to }) => ({ from: resolve(cwd, from), to: resolve(cwd, to) })),
  );
  return expanded;
}
