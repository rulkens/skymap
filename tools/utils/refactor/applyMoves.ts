/**
 * applyMoves: move a batch of files inside a ts-morph `Project`, with every
 * reference to them rewritten by the move-files package.
 *
 * `refactor rename` keeps its in-memory Project, so this hands the package a snapshot
 * of the Project's text and applies the edits back. The caller expanded companions.
 * `aliasScopes` is empty because no tsconfig here maps a bare specifier to a file a
 * rename could move. Only TS and TSX are in the Project, so stylesheets stay put.
 */

import type { Project } from 'ts-morph';
import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';
import { assertDestinationsFree } from './assertDestinationsFree';
import { rewriteReferences } from '../../../packages/move-files/src/rewriteReferences';

// `overwrite: true` below is needed for a case-only rename on a case-folding disk.
export function applyMoves(project: Project, moves: ReadonlyArray<MovePair>): void {
  const texts = new Map(
    project.getSourceFiles().map((f) => [f.getFilePath() as string, f.getFullText()]),
  );
  const fs = project.getFileSystem();
  assertDestinationsFree(project, moves);
  const edits = rewriteReferences(
    { texts, fileExists: (path) => fs.fileExistsSync(path) },
    new Map(moves.map((m) => [m.from, m.to])),
    [],
  );

  for (const { from, to, text } of edits) {
    if (from === to) project.getSourceFileOrThrow(from).replaceWithText(text);
    else {
      project.getSourceFileOrThrow(from).delete();
      project.createSourceFile(to, text, { overwrite: true });
    }
  }
}
