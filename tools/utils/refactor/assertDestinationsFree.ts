import type { Project } from 'ts-morph';
import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';

// The refusal `SourceFile.move()` made for an occupied destination; applyMoves needs
// `overwrite: true` for case-only renames, so nothing else stops a clobber. On a
// case-insensitive disk a lookup of `foo.ts` answers with `Foo.ts`, the source itself,
// so only an exact path counts as occupied, and the disk can't judge a case variant.
export function assertDestinationsFree(project: Project, moves: ReadonlyArray<MovePair>): void {
  for (const { from, to } of moves) {
    const inProject = project.getSourceFile(to)?.getFilePath() === to;
    const onDisk =
      from.toLowerCase() !== to.toLowerCase() && project.getFileSystem().fileExistsSync(to);
    if (inProject || onDisk) throw new Error(`Cannot move ${from}: ${to} already exists`);
  }
}
