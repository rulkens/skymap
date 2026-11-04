import type { Project } from 'ts-morph';
import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';

// The refusal `SourceFile.move()` made for an occupied destination; applyMoves needs
// `overwrite: true` for case-only renames, so nothing else stops a clobber.
export function assertDestinationsFree(project: Project, moves: ReadonlyArray<MovePair>): void {
  for (const { from, to } of moves) {
    if (from.toLowerCase() === to.toLowerCase()) continue;
    if (project.getSourceFile(to) !== undefined || project.getFileSystem().fileExistsSync(to))
      throw new Error(`Cannot move ${from}: ${to} already exists`);
  }
}
