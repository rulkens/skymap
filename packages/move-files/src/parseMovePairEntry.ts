/** parseMovePairEntry: validate one untyped manifest row as a `{ from, to }` move pair. */

import type { MovePair } from './@types/MovePair';

export function parseMovePairEntry(entry: unknown): MovePair {
  const row = entry as { from?: unknown; to?: unknown } | null;
  if (typeof row?.from === 'string' && typeof row.to === 'string') {
    return { from: row.from, to: row.to };
  }
  throw new Error('Each move manifest entry must be an object of the form { from, to }.');
}
