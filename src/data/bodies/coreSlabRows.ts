/**
 * CORE_SLAB_ROWS — the authored `body-m` slab rows core owns, alongside the
 * ones derived per frame from the store roster (`bodySlabRowOf`). Sgr A*'s
 * lens row sits here until the blackHoles Layer takes it.
 *
 * `activeBand` is the SAME object `CUBEMAP_CAPTURES.sgrAStar` holds, by
 * reference: the lens samples the sky that capture bakes, so a band the two
 * disagreed on would sample a cubemap nothing had captured into.
 */

import type { SlabRow } from '../../@types/engine/frame/SlabRow';
import type { BodyId } from '../../@types/data/body/BodyId';
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import { SGR_A_STAR } from './sceneSgrAStar';

// r_s: the datum IS the Schwarzschild radius, and the row draws nothing wider
// today — `reliefM` is [0, 0], no shell, no ring. Not the lens quad's extent,
// which the blackHoles Layer's own footprint will state.
const SGR_A_STAR_RADIUS_M = SGR_A_STAR.surface.datumRadiusM;

// The hole's own r_s-scale disc clears the 1-px roster floor only well inside
// the band (~346 AU on a dpr-2 1080p-class viewport, where the band is already
// ~0.4): a visible, viewport-dependent pop. Floored at the band's own outer
// edge instead, so the row — and with it the lens step — is born exactly where
// alpha = 0. The frustum cull goes with it: inside the band the lensed
// footprint can span most of the view, so no disc-based cull is conservative.
export const CORE_SLAB_ROWS: readonly SlabRow[] = [
  {
    anchorId: SGR_A_STAR.id as BodyId,
    boundingRadiusM: SGR_A_STAR_RADIUS_M,
    footprintRadiusM: SGR_A_STAR_RADIUS_M,
    activeBand: SCALE_FADE_BANDS.sgrAStarLensing,
    cullFloorMpc: SCALE_FADE_BANDS.sgrAStarLensing.goneAt,
    source: 'lens',
  },
];
