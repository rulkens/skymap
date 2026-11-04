/** readMoveManifest: a `--manifest` file, a JSON array of `{ from, to }`, as move pairs. */

import { readFileSync } from 'node:fs';
import type { MovePair } from './@types/MovePair';
import { parseMovePairEntry } from './parseMovePairEntry';

export function readMoveManifest(path: string): MovePair[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Cannot read manifest '${path}' as JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`Manifest '${path}' must be a JSON array.`);
  return parsed.map(parseMovePairEntry);
}
