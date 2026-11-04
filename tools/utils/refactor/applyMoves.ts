/**
 * applyMoves: move a batch of files inside a ts-morph `Project`, with every
 * reference to them rewritten by the move-files package.
 *
 * `refactor rename` keeps its in-memory Project (the identifier rename already
 * lives there), so this adapter hands the package a snapshot of the Project's
 * current text and applies the returned edits back. Companions were expanded by
 * the caller, so the context carries none. `aliasScopes` is empty because no
 * tsconfig in this repo maps a bare specifier to a file a rename could move.
 * Only TS and TSX are in the Project, so a rename leaves stylesheets alone.
 */

import type { Project } from 'ts-morph';
import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';
import { rewriteReferences } from '../../../packages/move-files/src/rewriteReferences';

export function applyMoves(project: Project, moves: ReadonlyArray<MovePair>): void {
  const texts = new Map(
    project.getSourceFiles().map((f) => [f.getFilePath() as string, f.getFullText()]),
  );
  const fs = project.getFileSystem();
  const edits = rewriteReferences(
    { texts, fileExists: (path) => fs.fileExistsSync(path) },
    new Map(moves.map((m) => [m.from, m.to])),
    { root: '/', config: { companions: [], extraMockCallees: [] }, aliasScopes: [] },
  );

  const created: { path: string; text: string }[] = [];
  for (const { from, to, text } of edits) {
    if (from === to) {
      const file = project.getSourceFileOrThrow(from);
      if (file.getFullText() !== text) file.replaceWithText(text);
    } else {
      project.getSourceFileOrThrow(from).delete();
      created.push({ path: to, text });
    }
  }
  for (const { path, text } of created) project.createSourceFile(path, text, { overwrite: true });
}
