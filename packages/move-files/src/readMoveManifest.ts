/** readMoveManifest: a `--manifest` file, a JSON array of `{ from, to }`, as move pairs. */

import { readFileSync } from 'node:fs';
import type { MovePair } from './@types/MovePair';

export function readMoveManifest(path: string): MovePair[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Cannot read manifest '${path}' as JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`Manifest '${path}' must be a JSON array.`);
  return parsed.map((entry): MovePair => {
    const row = entry as { from?: unknown; to?: unknown } | null;
    if (typeof row?.from === 'string' && typeof row.to === 'string') {
      return { from: row.from, to: row.to };
    }
    throw new Error('Each move manifest entry must be an object of the form { from, to }.');
  });
}
