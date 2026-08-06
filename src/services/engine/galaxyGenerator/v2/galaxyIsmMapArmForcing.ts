/**
 * galaxyIsmMapArmForcing — bakes the SSPSF automaton's arm-forcing field on
 * the CPU, onto the SAME 1536x512 log-polar grid `ismMapAutomatonStep.wesl`
 * steps, from the EXISTING ridge functions the sprite/analytic arms are
 * placed against (`armRidgeCurvePoint`/`armCrossSigma`/`armFadeEnvelope`) —
 * never re-derived in WGSL, per research doc §19's "shared ridge truth by
 * import, not by re-deriving the curve" rule. Uploaded once per generation
 * (`rebuildIsmMap` in createGalaxyEngine.ts) as a small R32F texture the
 * automaton samples with a plain 1:1 `textureLoad`. The fluid generator
 * reuses this SAME CPU field (never the texture) — see
 * `galaxyIsmMapFluidEvents.ts`. Single-slot memo, same discipline as
 * `hiiRegions.ts`'s CDF memos: keyed on geometry identity plus
 * `tuning.arms.widthScale` (the only tuning value the ridge functions above
 * actually read), so a same-generation rebuild — this file's two call sites,
 * plus any fluid/automaton/dust slider drag that leaves arm geometry alone —
 * hits cache instead of repaying the O(rings x arms x az) bake.
 */
import { armRidgeCurvePoint, armCrossSigma, armFadeEnvelope } from './armRidgeGeometry';
import { ismMapRingRadius } from '../../../../utils/galaxy/ismMapRingRadius';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';

/**
 * Grid extent. Authoritative by construction: these size the ismMap textures
 * (createGalaxyEngine.ts), and every WGSL pass reads its own bound texture's
 * `textureDimensions` rather than a mirrored const, so there is no second
 * copy to drift.
 */
export const ISM_MAP_AZ = 1536;
export const ISM_MAP_RINGS = 512;

/**
 * `@workgroup_size(16, 16)` is a genuine WGSL compile-time literal, hand-set
 * in every ismMap compute entry point — unlike ISM_MAP_AZ/ISM_MAP_RINGS above,
 * it cannot be threaded from `textureDimensions`, so it stays mirrored (see
 * `tests/services/gpu/shaders/constants.parity.test.ts`'s ismMap block). TS
 * needs its own copy for dispatch-count math (ISM_MAP_AZ / this).
 */
export const ISM_MAP_WORKGROUP_SIZE = 16;

export type GalaxyIsmMapGridRadius = { readonly rMin: number; readonly rMax: number };

/**
 * How far inside `armStartRadius` the grid's inner edge sits. Forcing is
 * identically zero below the arm start (this file's own
 * `r <= geometry.armStartRadius` skip), so this margin exists only so
 * percolation can leak inward rather than hard-stop exactly there.
 */
const ISM_MAP_INNER_MARGIN_FRAC = 0.6;

/** Degenerate-galaxy guard: `ismMapRingRadius`'s log spacing needs rMax clear of rMin. */
const ISM_MAP_MIN_SPAN_RATIO = 2;

/**
 * The radius bounds one generated galaxy's log-radial grid spans. The outer
 * edge covers the OUTERMOST arm's own `fadeRadius` (falling back to
 * `outerRadius` when there are no arms) rather than stopping at `outerRadius`
 * itself: with dust now ISM-map-seeded only where this grid has data (the
 * smooth analytic tier that used to cover the rest was deleted — see
 * `galaxyDustMixture.ts`'s header), a truncation at `outerRadius` was a
 * visible hard edge mid-arm (`outerRadius` ~10.5 vs per-arm `fadeRadius`
 * 11.3-15.5, `armFadeEnvelope` still 20-97% of peak there, per arm).
 *
 * COST: rings are log-spaced over [rMin, rMax] at a fixed `ISM_MAP_RINGS`, so
 * widening rMax spends radial resolution on the newly-covered outer arm —
 * roughly 20% fewer rings across the inner disc for ~43% more coverage.
 * Raise `ISM_MAP_RINGS` if inner detail starts to suffer.
 */
export function ismMapGridRadius(geometry: GalaxyDescription): GalaxyIsmMapGridRadius {
  const rMin = Math.max(geometry.armStartRadius * ISM_MAP_INNER_MARGIN_FRAC, 1e-3);
  const outerArmRadius =
    geometry.numArms > 0 && geometry.arms.length > 0
      ? Math.max(...geometry.arms.map((arm) => arm.fadeRadius))
      : geometry.outerRadius;
  const rMax = Math.max(outerArmRadius, rMin * ISM_MAP_MIN_SPAN_RATIO);
  return { rMin, rMax };
}

/**
 * The same bounds for a galaxy that may not be generated yet. The ismMap chain
 * dispatches before the first geometry exists, and the automaton's grid must
 * agree with the orientation chain's texel for texel or the two silently
 * sample different rings — so the placeholder lives here, once, rather than
 * being written out at each site.
 */
export function ismMapGridRadiusOrDefault(
  geometry: GalaxyDescription | null,
): GalaxyIsmMapGridRadius {
  return geometry ? ismMapGridRadius(geometry) : { rMin: 1e-3, rMax: 1 };
}

/**
 * Cross-track distance from a grid cell to an arm's ridge, in the disc
 * PLANE only (the warp's small vertical offset is ignored — a step-1
 * simplification the forcing field shares with `ismMapPresent.wesl`'s own
 * flat-plane resample). `r * angularOffset` is the small-angle approximation
 * `pushArmRidges` avoids by working in full 3D blob frames; adequate here
 * since `armCrossSigma` is always much smaller than r on the arm's own
 * support.
 */
function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/** Gaussian support beyond this many sigma is exp(-12.5) ~ 4e-6 — invisible to every consumer (automaton forcing, fluid CDF, percolation thresholds). */
const CROSS_SIGMA_SUPPORT = 5;

function computeGalaxyIsmMapArmForcing(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): Float32Array {
  const { rMin, rMax } = ismMapGridRadius(geometry);
  const out = new Float32Array(ISM_MAP_AZ * ISM_MAP_RINGS);
  if (geometry.numArms <= 0) return out;

  for (let ring = 0; ring < ISM_MAP_RINGS; ring++) {
    const r = ismMapRingRadius(ring, ISM_MAP_RINGS, rMin, rMax);
    if (r <= geometry.armStartRadius) continue;
    const logR = Math.log(r / geometry.armStartRadius);
    const sigmaAcross = Math.max(armCrossSigma(r, geometry, tuning), 1e-4);
    // Az-index half-width of the support band, shared by every arm at this
    // ring (both r and sigmaAcross are ring-level, not arm-level).
    const halfWidthAz = ((CROSS_SIGMA_SUPPORT * sigmaAcross) / r / (2 * Math.PI)) * ISM_MAP_AZ;
    const rowBase = ring * ISM_MAP_AZ;

    for (const arm of geometry.arms) {
      const envelope = armFadeEnvelope(r, geometry, arm);
      if (envelope <= 0) continue;
      const point = armRidgeCurvePoint(logR, geometry, arm);
      const ridgeAngle = Math.atan2(point[2], point[0]);

      // Band narrower than the full circle: iterate only it, wrapping each
      // raw index back into [0, ISM_MAP_AZ) — a plain window when it clears
      // the seam, transparently the full sweep when the band is wide (the
      // `azHi` clamp), never a duplicate index either way since the raw
      // range never exceeds ISM_MAP_AZ distinct values.
      const azCenter = (ridgeAngle / (2 * Math.PI)) * ISM_MAP_AZ;
      const azLo = Math.floor(azCenter - halfWidthAz);
      const azHi = Math.min(azLo + ISM_MAP_AZ - 1, Math.ceil(azCenter + halfWidthAz));

      for (let rawAz = azLo; rawAz <= azHi; rawAz++) {
        const az = ((rawAz % ISM_MAP_AZ) + ISM_MAP_AZ) % ISM_MAP_AZ;
        const theta = (2 * Math.PI * az) / ISM_MAP_AZ;
        const crossDist = r * wrapAngle(theta - ridgeAngle);
        const gauss = Math.exp(-0.5 * (crossDist / sigmaAcross) ** 2);
        const idx = rowBase + az;
        out[idx] = Math.min(1, out[idx]! + envelope * gauss);
      }
    }
  }
  return out;
}

type CachedForcing = { readonly key: readonly unknown[]; readonly field: Float32Array };

function sameForcingKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Single-slot memo — same pattern as `hiiRegions.ts`'s `cachedCdf`. Sound
 * under any interleaving: a key miss just rebuilds, so this can only cost
 * performance, never correctness. Callers must treat the returned array as
 * read-only (both current call sites do: GPU upload, CDF read).
 */
let forcingCache: CachedForcing | null = null;

export function buildGalaxyIsmMapArmForcing(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): Float32Array {
  const key: readonly unknown[] = [geometry, tuning.arms.widthScale];
  if (forcingCache && sameForcingKey(forcingCache.key, key)) return forcingCache.field;
  const field = computeGalaxyIsmMapArmForcing(geometry, tuning);
  forcingCache = { key, field };
  return field;
}
