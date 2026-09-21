/**
 * The Sgr A* lens pass's DebugPanel tuning defaults.
 *
 * Tier 1 (`innerRs`..`flickerTimescaleS`) seeds from `BLACK_HOLES`'s Sgr A*
 * row — that registry is the single source of truth for those.
 *
 * Tier 2 (`diskScaleHeightRs` / `edgeFadeStartFraction` / `dopplerStrength` /
 * `emissionStrength` / `emissionTint`) has no other home: this literal IS
 * their source of truth, and the shader reads them off the uniform.
 *
 * `cubemapResolutionPx` seeds the `sky-cubemap` render-target row's declared
 * size (`renderTargets.ts`) — 1024, per a live-view judgment; the knob's
 * option set is 256/512/1024/2048.
 */

import { BLACK_HOLES } from '../../../../data/blackHoles';
import { SGR_A_STAR } from '../../../../data/bodies/sceneSgrAStar';
import type { SgrAStarLensingTuning } from '../../../../@types/settings/SgrAStarLensingTuning';

const SGR_A_STAR_BLACK_HOLE_ROW = BLACK_HOLES.find((row) => row.bodyId === SGR_A_STAR.id)!;

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
