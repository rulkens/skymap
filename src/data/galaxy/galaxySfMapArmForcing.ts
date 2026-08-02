/**
 * galaxySfMapArmForcing — bakes the SSPSF automaton's arm-forcing field on
 * the CPU, onto the SAME 768x256 log-polar grid `sfMapStep.wesl` steps, from
 * the EXISTING ridge functions the sprite/analytic arms are placed against
 * (`armRidgeCurvePoint`/`armCrossSigma`/`armFadeEnvelope`) — never
 * re-derived in WGSL, per research doc §19's "shared ridge truth by import,
 * not by re-deriving the curve" rule. Uploaded once per generation
 * (`rebuildSfMap` in createGalaxyEngine.ts) as a small R32F texture the
 * automaton samples with a plain 1:1 `textureLoad`, since it is baked at
 * this file's own grid extent.
 */
import { armRidgeCurvePoint, armCrossSigma, armFadeEnvelope } from './armRidgeGeometry';
import { sfMapRingRadius } from '../../utils/galaxy/sfMapRingRadius';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../@types/galaxy/GalaxyFieldTuning';

/**
 * Grid extent. Authoritative by construction: these size the sfMap textures
 * (createGalaxyEngine.ts), and every WGSL pass reads its own bound texture's
 * `textureDimensions` rather than a mirrored const, so there is no second
 * copy to drift.
 */
export const SF_MAP_AZ = 768;
export const SF_MAP_RINGS = 256;

/**
 * `@workgroup_size(16, 16)` is a genuine WGSL compile-time literal, hand-set
 * in every sfMap compute entry point — unlike SF_MAP_AZ/SF_MAP_RINGS above,
 * it cannot be threaded from `textureDimensions`, so it stays mirrored (see
 * `tests/services/gpu/shaders/constants.parity.test.ts`'s sfMap block). TS
 * needs its own copy for dispatch-count math (SF_MAP_AZ / this).
 */
export const SF_MAP_WORKGROUP_SIZE = 16;

export type GalaxySfMapGridRadius = { readonly rMin: number; readonly rMax: number };

/**
 * The radius bounds one generated galaxy's log-radial grid spans.
 * `armStartRadius` floors the inner edge; forcing is identically zero below
 * it (this file's own `r <= geometry.armStartRadius` skip), so the margin
 * below it exists only so percolation can leak inward rather than hard-stop
 * exactly at the arm start. `outerRadius` caps the outer edge, matching the
 * disc the sprites themselves are drawn out to.
 */
export function sfMapGridRadius(geometry: GalaxyFieldGeometry): GalaxySfMapGridRadius {
  const rMin = Math.max(geometry.armStartRadius * 0.6, 1e-3);
  const rMax = Math.max(geometry.outerRadius, rMin * 2);
  return { rMin, rMax };
}

/**
 * Cross-track distance from a grid cell to an arm's ridge, in the disc
 * PLANE only (the warp's small vertical offset is ignored — a step-1
 * simplification the forcing field shares with `sfMapPresent.wesl`'s own
 * flat-plane resample). `r * angularOffset` is the small-angle approximation
 * `pushArmRidges` avoids by working in full 3D blob frames; adequate here
 * since `armCrossSigma` is always much smaller than r on the arm's own
 * support.
 */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function buildGalaxySfMapArmForcing(
  geometry: GalaxyFieldGeometry,
  tuning: GalaxyFieldTuning,
): Float32Array {
  const { rMin, rMax } = sfMapGridRadius(geometry);
  const out = new Float32Array(SF_MAP_AZ * SF_MAP_RINGS);
  if (geometry.numArms <= 0) return out;

  for (let ring = 0; ring < SF_MAP_RINGS; ring++) {
    const r = sfMapRingRadius(ring, SF_MAP_RINGS, rMin, rMax);
    if (r <= geometry.armStartRadius) continue;
    const logR = Math.log(r / geometry.armStartRadius);
    const sigmaAcross = Math.max(armCrossSigma(r, geometry, tuning), 1e-4);

    for (const arm of geometry.arms) {
      if (r > arm.fadeRadius * 1.05) continue;
      const envelope = armFadeEnvelope(r, geometry, arm);
      if (envelope <= 0) continue;
      const point = armRidgeCurvePoint(logR, geometry, arm);
      const ridgeAngle = Math.atan2(point[2], point[0]);

      const rowBase = ring * SF_MAP_AZ;
      for (let az = 0; az < SF_MAP_AZ; az++) {
        const theta = (2 * Math.PI * az) / SF_MAP_AZ;
        const crossDist = r * wrapAngle(theta - ridgeAngle);
        const gauss = Math.exp(-0.5 * (crossDist / sigmaAcross) ** 2);
        const idx = rowBase + az;
        out[idx] = Math.min(1, out[idx]! + envelope * gauss);
      }
    }
  }
  return out;
}
