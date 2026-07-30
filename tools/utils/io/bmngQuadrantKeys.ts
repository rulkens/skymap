/**
 * `BMNG_QUADRANT_KEYS` — the raw-data key of each Blue Marble quadrant, keyed by
 * the quadrant's own name.
 *
 * The eight quadrant files have two consumers that must agree: `buildEarthTiles`
 * reads their pixels, and `fetchTextures` downloads them. Enumerating them twice
 * is precisely how they came to be un-fetchable in the first place (the bake
 * named eight registry keys, the fetcher named none, and the 421 MB pull was
 * done by hand) — the same failure `textureSources.ts` exists to prevent for the
 * body maps. So the set is written once, here, and both halves derive from it.
 *
 * `satisfies Record<BmngQuadrant, RawDataKey>` is what makes a forgotten
 * quadrant a compile error rather than a hole in the globe: the key type is the
 * quadrant union the imagery source itself derives from its grid axes, so this
 * table and that grid cannot disagree. The import is TYPE-ONLY, so nothing in
 * `tools/utils/` depends on `tools/textures/` at runtime.
 *
 * The keys are vintage-neutral (`…QuadrantA1`, not `…200408A1`): the month lives
 * in `BMNG_VINTAGE` alone, and a key that spelled it would go on claiming
 * December after the files underneath it became August.
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
