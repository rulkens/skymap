/**
 * body — the Layer's user-settable defaults, seeding `sgrAStarLensingTuningSlice`
 * and `orbitTrailsSlice`. The lensing tuning's tier-1 fields are registry-derived;
 * its tier-2 fields have no other home. See each constant's comment.
 */

import type { SgrAStarLensingTuning } from '../../../@types/settings/SgrAStarLensingTuning';
import { BLACK_HOLES } from '../../../data/blackHoles';
import { SGR_A_STAR } from '../../../data/bodies/sceneSgrAStar';

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
const SGR_A_STAR_BLACK_HOLE_ROW = BLACK_HOLES.find((row) => row.bodyId === SGR_A_STAR.id)!;
export const DEFAULT_SGR_A_STAR_LENSING_TUNING: SgrAStarLensingTuning = {
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

/**
 * Orbit-trails overlay default — ON.  The near-field Keplerian orbit trails
 * (Earth / Jupiter / Moon …) are part of the baseline solar-system scene, so the
 * master gate defaults on.  A plain `true` literal like
 * `DEFAULT_MILKY_WAY_LABEL_ENABLED`: the trails are a compile-time conic table
 * (`ORBITAL_ELEMENTS`), not a registry source with its own `visible` gate, so the
 * literal is the honest single source of truth for this axis.
 */
export const DEFAULT_ORBIT_TRAILS_ENABLED: boolean = true;
