/**
 * The Sgr A* lens pass's DebugPanel tuning defaults. Tier 1 (`innerRs`..
 * `flickerTimescaleS`) seeds from `BLACK_HOLES`'s Sgr A* row, the single
 * source of truth for those; tier 2 (`diskScaleHeightRs` onward) has no
 * other home — this literal IS their source of truth. `cubemapResolutionPx`
 * seeds the `sky-cubemap` render-target row's declared size (1024).
 */

import { BLACK_HOLES } from '../../data/blackHoles';
import { SGR_A_STAR_ENTRY } from '../../sources/sgrAStar';
import type { SgrAStarLensingTuning } from '../../@types/SgrAStarLensingTuning';

const SGR_A_STAR_BLACK_HOLE_ROW = BLACK_HOLES.find((row) => row.id === SGR_A_STAR_ENTRY.id)!;

export const initialState: SgrAStarLensingTuning = {
  innerRs: SGR_A_STAR_BLACK_HOLE_ROW.emission.innerRs,
  outerRs: SGR_A_STAR_BLACK_HOLE_ROW.emission.outerRs,
  inclinationRad: SGR_A_STAR_BLACK_HOLE_ROW.emission.inclinationRad,
  positionAngleRad: SGR_A_STAR_BLACK_HOLE_ROW.emission.positionAngleRad,
  flickerAmp: SGR_A_STAR_BLACK_HOLE_ROW.emission.flickerAmp,
  flickerTimescaleS: SGR_A_STAR_BLACK_HOLE_ROW.emission.flickerTimescaleS,
  diskScaleHeightRs: 0.4,
  edgeFadeStartFraction: 0.7,
  dopplerStrength: 0.6,
  emissionStrength: 1,
  emissionTint: [1, 1, 1],
  cubemapResolutionPx: 1024,
};
