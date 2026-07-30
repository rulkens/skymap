/**
 * `BMNG_QUADRANT_KEYS` — the raw-data key of each Blue Marble quadrant, keyed
 * by the quadrant's own name. `buildEarthTiles` reads their pixels and
 * `fetchTextures` downloads them; both derive from this one enumeration
 * rather than each naming the eight files separately (which is exactly how
 * they once went unfetched — the bake named keys, the fetcher named none).
 *
 * `satisfies Record<BmngQuadrant, RawDataKey>` makes a forgotten quadrant a
 * compile error rather than a hole in the globe (the import is TYPE-ONLY).
 * Keys are vintage-neutral (`…QuadrantA1`, not `…200408A1`) — the month lives
 * in `BMNG_VINTAGE` alone.
 */

import type { BmngQuadrant } from '../../textures/bmngQuadrantSource';
import type { RawDataKey } from './rawDataRegistry';

export const BMNG_QUADRANT_KEYS = {
  A1: 'textures.nasaBmngQuadrantA1',
  A2: 'textures.nasaBmngQuadrantA2',
  B1: 'textures.nasaBmngQuadrantB1',
  B2: 'textures.nasaBmngQuadrantB2',
  C1: 'textures.nasaBmngQuadrantC1',
  C2: 'textures.nasaBmngQuadrantC2',
  D1: 'textures.nasaBmngQuadrantD1',
  D2: 'textures.nasaBmngQuadrantD2',
} as const satisfies Record<BmngQuadrant, RawDataKey>;
