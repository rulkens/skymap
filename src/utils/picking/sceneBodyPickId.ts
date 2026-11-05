/**
 * sceneBodyPickId — the caption pick's twin of each body layer's `drawPick`:
 * same codes (the caller's `codeOf`), seed tables and `PICK_SENTINEL_OFFSET`. Bodies only; a star's
 * caption packs its own source + seed index, which its drawn row already
 * carries. `null` means SKIP: an index packed from −1 would alias body 0.
 */

import { SOURCE_ENTRIES } from '../../data/sourceEntries';
import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../data/selectionEncoding';
import { seedIndexOfBody } from './seedIndexOfBody';
import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import type { BodySourceId } from '../../@types/data/body/BodySourceId';

const BODY_ENTRIES = SOURCE_ENTRIES.filter((entry) => entry.type === 'body');

export function sceneBodyPickId(
  id: string,
  codeOf: (entry: BodySourceEntry) => number,
): number | null {
  for (const entry of BODY_ENTRIES) {
    const index = seedIndexOfBody(id, BODY_PICK_ROWS[entry.id as BodySourceId]);
    if (index >= 0) return packSelection(codeOf(entry), index + PICK_SENTINEL_OFFSET);
  }
  return null;
}
