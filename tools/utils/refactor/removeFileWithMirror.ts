/**
 * removeFileWithMirror — delete a source file from the ts-morph `Project` and, if
 * the Project knows it, the file's `tests/` mirror alongside it.
 *
 * A mirror test exists because its source exists; orphaning it rots the parallel
 * tree the repo maintains (`src/x.ts` ↔ `tests/x.test.ts`). So whenever a planner
 * decides a source file has become a husk and drops it, its mirror must go too.
 *
 * Mirror derivation reuses `anchorToMirroredRoot` (to speak the repo-relative
 * language the mirror convention is expressed in) and `expandTestMirrors` (the one
 * definition of the `src/`↔`tests/` mapping and the `.test.ts`/`.test.tsx` suffix
 * probing), with the Project itself as the existence oracle. That keeps the
 * convention in a single place and works identically on the real repo and on an
 * in-memory fixture — no filesystem probe a synthetic Project could not satisfy.
 *
 * This is the shared file-removal step for `planDelete` (sole-export delete) and
 * `planInline` (one-symbol wrapper elimination): the second caller is why it lives
 * here rather than inline in either planner.
 */

import type { Project, SourceFile } from 'ts-morph';
import { anchorToMirroredRoot } from './anchorToMirroredRoot';
import { expandTestMirrors } from './expandTestMirrors';

export function removeFileWithMirror(project: Project, sourceFile: SourceFile): void {
  const anchor = anchorToMirroredRoot(sourceFile.getFilePath());
  if (anchor !== null) {
    const { rel, prefix } = anchor;
    const moves = expandTestMirrors(
      [{ from: rel, to: rel }],
      (relPath) => project.getSourceFile(prefix + relPath) !== undefined,
    );
    for (const { from } of moves) {
      if (!from.startsWith('tests/')) continue; // the source file itself, deleted below
      project.getSourceFile(prefix + from)?.delete();
    }
  }
  sourceFile.delete();
}
