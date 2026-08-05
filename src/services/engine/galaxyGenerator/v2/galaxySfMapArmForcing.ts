/**
 * galaxySfMapArmForcing — bakes the SSPSF automaton's arm-forcing field on
 * the CPU, onto the SAME 1536x512 log-polar grid `sfMapStep.wesl` steps, from
 * the EXISTING ridge functions the sprite/analytic arms are placed against
 * (`armRidgeCurvePoint`/`armCrossSigma`/`armFadeEnvelope`) — never
 * re-derived in WGSL, per research doc §19's "shared ridge truth by import,
 * not by re-deriving the curve" rule. Uploaded once per generation
 * (`rebuildSfMap` in createGalaxyEngine.ts) as a small R32F texture the
 * automaton samples with a plain 1:1 `textureLoad`, since it is baked at
 * this file's own grid extent.
 */
import { armRidgeCurvePoint, armCrossSigma, armFadeEnvelope } from './armRidgeGeometry';
import { sfMapRingRadius } from '../../../../utils/galaxy/sfMapRingRadius';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';

/**
 * Grid extent. Authoritative by construction: these size the sfMap textures
 * (createGalaxyEngine.ts), and every WGSL pass reads its own bound texture's
 * `textureDimensions` rather than a mirrored const, so there is no second
 * copy to drift.
 */
export const SF_MAP_AZ = 1536;
export const SF_MAP_RINGS = 512;

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
 * How far inside `armStartRadius` the grid's inner edge sits. Forcing is
 * identically zero below the arm start (this file's own
 * `r <= geometry.armStartRadius` skip), so this margin exists only so
 * percolation can leak inward rather than hard-stop exactly there.
 */
const SF_MAP_INNER_MARGIN_FRAC = 0.6;

/** Degenerate-galaxy guard: `sfMapRingRadius`'s log spacing needs rMax clear of rMin. */
const SF_MAP_MIN_SPAN_RATIO = 2;

/**
 * The radius bounds one generated galaxy's log-radial grid spans. The outer
 * edge covers the OUTERMOST arm's own `fadeRadius` (falling back to
 * `outerRadius` when there are no arms) rather than stopping at `outerRadius`
 * itself: with dust now SF-map-seeded only where this grid has data (the
 * smooth analytic tier that used to cover the rest was deleted — see
 * `galaxyDustMixture.ts`'s header), a truncation at `outerRadius` was a
 * visible hard edge mid-arm (`outerRadius` ~10.5 vs per-arm `fadeRadius`
 * 11.3-15.5, `armFadeEnvelope` still 20-97% of peak there, per arm).
 *
 * COST: rings are log-spaced over [rMin, rMax] at a fixed `SF_MAP_RINGS`, so
 * widening rMax spends radial resolution on the newly-covered outer arm —
 * roughly 20% fewer rings across the inner disc for ~43% more coverage.
 * Raise `SF_MAP_RINGS` if inner detail starts to suffer.
 */
export function sfMapGridRadius(geometry: GalaxyDescription): GalaxySfMapGridRadius {
  const rMin = Math.max(geometry.armStartRadius * SF_MAP_INNER_MARGIN_FRAC, 1e-3);
  const outerArmRadius =
    geometry.numArms > 0 && geometry.arms.length > 0
      ? Math.max(...geometry.arms.map((arm) => arm.fadeRadius))
      : geometry.outerRadius;
  const rMax = Math.max(outerArmRadius, rMin * SF_MAP_MIN_SPAN_RATIO);
  return { rMin, rMax };
}

/**
 * The same bounds for a galaxy that may not be generated yet. The sfMap chain
 * dispatches before the first geometry exists, and the automaton's grid must
 * agree with the orientation chain's texel for texel or the two silently
 * sample different rings — so the placeholder lives here, once, rather than
 * being written out at each site.
 */
export function sfMapGridRadiusOrDefault(
  geometry: GalaxyDescription | null,
): GalaxySfMapGridRadius {
  return geometry ? sfMapGridRadius(geometry) : { rMin: 1e-3, rMax: 1 };
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
  geometry: GalaxyDescription,
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
