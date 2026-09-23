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
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import { GALACTIC_CENTRE_ANCHOR } from '../places/galacticCentre';
import { SGR_A_STAR } from './sceneSgrAStar';
import { sgrAStarLensEnvelopeM } from './sgrAStarLensEnvelope';

// r_s: the datum IS the Schwarzschild radius, the occupied sphere.
const SGR_A_STAR_RADIUS_M = SGR_A_STAR.surface.datumRadiusM;

// The drawn extent IS the lensed sphere, and it is 0 outside the band, so the
// roster culls and `activeBand` agree by construction — no bypass needed.
export const CORE_SLAB_ROWS: readonly SlabRow[] = [
  {
    // The PLACE, not the body: the row is posed from the Galactic Centre, so
    // the pose key does not move when the Layer takes the black hole over.
    anchorId: GALACTIC_CENTRE_ANCHOR.id,
    drawRadiusM: sgrAStarLensEnvelopeM,
    footprintRadiusM: SGR_A_STAR_RADIUS_M,
    activeBand: SCALE_FADE_BANDS.sgrAStarLensing,
    source: 'lens',
  },
];
