/**
 * sceneBodyPickId — the caption pick's twin of each body layer's `drawPick`:
 * same codes, seed tables and `PICK_SENTINEL_OFFSET`. Scans `type: 'body'`
 * rows against `BODY_PICK_ROWS`, skipping the Sun (drawn by the STAR layers
 * under `Source.FamousStar`), then falls through to `starPickId`. `null`
 * means SKIP: an index packed from −1 would alias body 0.
 */

import { SOURCE_ENTRIES } from '../../../../data/sourceEntries';
import { BODY_PICK_ROWS } from '../../../../data/bodies/bodyPickRows';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { seedIndexOfBody } from './seedIndexOfBody';
import { starPickId } from './starPickId';
import type { BodyId } from '../../../../@types/data/body/BodyId';

const BODY_ENTRIES = SOURCE_ENTRIES.filter((entry) => entry.type === 'body' && entry.id !== 'sun');

export function sceneBodyPickId(id: string): number | null {
  for (const entry of BODY_ENTRIES) {
    const index = seedIndexOfBody(id, BODY_PICK_ROWS[entry.id as BodyId]);
    if (index >= 0) return packSelection(entry.code, index + PICK_SENTINEL_OFFSET);
  }
  return starPickId(id);
}
