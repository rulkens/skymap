/**
 * bodySlabsOf — a view's slab table holding one `body-m` slab per row, array position
 * = `index`, for a fixture ctx that fakes its view rather than deriving it.
 */

import type { Slab } from '../../../src/@types/engine/frame/Slab';
import type { SlabRow } from '../../../src/@types/engine/frame/SlabRow';
import { BODY_SLAB_ROWS } from '../../../src/layers/body/slabs/present/bodySlabRows';
import { makeSlab } from '../../fixtures/makeSlab';

export function bodySlabsOf(rows: readonly SlabRow[] = BODY_SLAB_ROWS): Slab[] {
  return rows.map((row, index) =>
    makeSlab({ index, frame: { kind: 'body-m', hostId: row.anchorId } }),
  );
}
