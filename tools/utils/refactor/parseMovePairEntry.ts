/**
 * parseMovePairEntry — validate one untyped manifest row as a `{ from, to }`
 * move pair.
 *
 * ## Why the object shape, and why it is shared
 *
 * `readManifest` proves only that a batch file parses to an array; the ELEMENT
 * shape is per-subcommand. `move`'s element is the `{ from, to }` object its
 * manifests have always used (`npm run move-files -- --manifest moves.json`),
 * which predates the CLI's string-tuple entries. Both callers that decode a
 * move batch — `moveFiles.ts` (which wants a `MovePair`) and `refactor move`
 * (which adapts it to a `[from, to]` positional tuple) — validate the exact
 * same object, so the check lives here once rather than in two hand-rolled
 * copies.
 */

import type { MovePair } from './applyMoves';

export function parseMovePairEntry(entry: unknown): MovePair {
  if (
    entry !== null &&
    typeof entry === 'object' &&
    'from' in entry &&
    'to' in entry &&
    typeof (entry as { from: unknown }).from === 'string' &&
    typeof (entry as { to: unknown }).to === 'string'
  ) {
    const { from, to } = entry as { from: string; to: string };
    return { from, to };
  }
  throw new Error('Each move manifest entry must be an object of the form { from, to }.');
}
