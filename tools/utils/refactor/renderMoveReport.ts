/**
 * renderMoveReport — format the move preview shared by `npm run move-files` and
 * `refactor move`: the list of expanded moves, then the blast radius of files
 * whose imports ts-morph rewrote.
 *
 * ## Why a shared renderer
 *
 * Both entrypoints print the identical two-section report — the expanded move
 * list and the set of files with updated imports — so a second inline copy of
 * the `stdout.write` loop would be exactly the duplication the house rule says
 * to extract. The tool prefix is the only thing that differs between them
 * (`move-files` vs `refactor move`), so it is a parameter; everything below it
 * is byte-for-byte the same, which is what keeps the long-standing
 * `move-files` output stable while giving `refactor move` a matching preview.
 *
 * The rewritten paths arrive as strings (each caller maps its own unsaved
 * `SourceFile`s to `getFilePath()`), so this stays a pure formatter with no
 * ts-morph dependency of its own.
 */

import type { MovePair } from './applyMoves';

export function renderMoveReport(
  prefix: string,
  moves: ReadonlyArray<MovePair>,
  rewrittenPaths: readonly string[],
): string {
  const lines = [`${prefix}: ${moves.length} move(s):`];
  for (const { from, to } of moves) lines.push(`  ${from}  ->  ${to}`);
  lines.push('', `${prefix}: ${rewrittenPaths.length} file(s) with updated imports:`);
  for (const path of rewrittenPaths) lines.push(`  ${path}`);
  return `${lines.join('\n')}\n`;
}
