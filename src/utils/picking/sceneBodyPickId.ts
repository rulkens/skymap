/**
 * sceneBodyPickId — the caption pick's twin of each body layer's `drawPick`:
 * same codes, seed tables and `PICK_SENTINEL_OFFSET`. Star ids are left to
 * `starPickId`, the one place a star id picks its table. `null` means SKIP:
 * an index packed from −1 would alias body 0.
 */

import { SOURCE_ENTRIES } from '../../data/sourceEntries';
import { BODY_PICK_ROWS } from '../../data/bodies/bodyPickRows';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../data/selectionEncoding';
import { seedIndexOfBody } from './seedIndexOfBody';
import { starPickId } from './starPickId';
import type { BodyId } from '../../@types/data/body/BodyId';

// Both STAR rows are excluded. `sun`'s row IS `SCENE_STARS`, so without the
// skip 'sirius' packs Source.Sun — wrong, and invisible to the round-trip test,
// which reads that same row back. `s-star`'s row would pack exactly the bytes
// `starPickId` packs: a second route to one answer.
const PACKABLE_BODY_ENTRIES = SOURCE_ENTRIES.filter(
  (entry) => entry.type === 'body' && entry.id !== 'sun' && entry.id !== 's-star',
);

export function sceneBodyPickId(id: string): number | null {
  for (const entry of PACKABLE_BODY_ENTRIES) {
    const index = seedIndexOfBody(id, BODY_PICK_ROWS[entry.id as BodyId]);
    if (index >= 0) return packSelection(entry.code, index + PICK_SENTINEL_OFFSET);
  }
  return starPickId(id);
}
