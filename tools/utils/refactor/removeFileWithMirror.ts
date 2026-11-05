/**
 * removeFileWithMirror: delete a source file from the ts-morph `Project` and its
 * companion tests, for `planDelete` and `planInline`. A mirror exists because its
 * source does. `expandCompanions` is asked in paths relative to the Project's cwd, so
 * this works the same on the real repo and on an in-memory fixture.
 */

import { posix } from 'node:path';
import type { Project, SourceFile } from 'ts-morph';
import { expandCompanions } from '../../../packages/move-files/src/expandCompanions';
import { companionRules } from './companionRules';

export function removeFileWithMirror(project: Project, sourceFile: SourceFile): void {
  const root = project.getFileSystem().getCurrentDirectory();
  const rel = posix.relative(root, sourceFile.getFilePath());
  const moves = expandCompanions(
    [{ from: rel, to: rel }],
    companionRules,
    (path) => project.getSourceFile(posix.resolve(root, path)) !== undefined,
  );
  for (const { from } of moves.slice(1)) project.getSourceFile(posix.resolve(root, from))?.delete();
  sourceFile.delete();
}
