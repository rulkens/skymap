/**
 * Bakes the ISM map's arm-forcing field on the CPU, onto the same 1536x512
 * log-polar grid `ismMapFluidStep.wesl` steps, from the ridge functions the
 * rendered arms use (`armRidgeCurvePoint`/`armCrossSigma`/`armFadeEnvelope`)
 * — never re-derived in WGSL. Uploaded once per generation as an R32F
 * texture the fluid step shader samples with `textureLoad`;
 * `galaxyIsmMapFluidEvents.ts` reuses this same CPU field, never the
 * texture. Single-slot memo keyed on geometry identity plus the tuning
 * fields the walk below actually reads.
 */
import { armRidgeCurvePoint, armCrossSigma, armFadeEnvelope } from './armRidgeGeometry';
import { buildArmSpurs } from './armSpurGeometry';
import { ismMapRingRadius } from '../../../../utils/galaxy/ismMapRingRadius';
import { memoizeLastByKeys } from '../../../../utils/cache/memoizeLastByKeys';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';

/** Grid extent; sizes the ismMap textures. Every WGSL pass reads its own texture's `textureDimensions`, so there's no mirrored copy to drift. */
export const ISM_MAP_AZ = 1536;
export const ISM_MAP_RINGS = 512;

/** WGSL hard-codes `@workgroup_size(16, 16)` as a compile-time literal, so unlike ISM_MAP_AZ/ISM_MAP_RINGS this stays mirrored — see `constants.parity.test.ts`'s ismMap block. */
export const ISM_MAP_WORKGROUP_SIZE = 16;

export type GalaxyIsmMapGridRadius = { readonly rMin: number; readonly rMax: number };

/** Forcing is zero below `armStartRadius` (this file's own skip), so this margin only lets percolation leak inward instead of hard-stopping there. */
const ISM_MAP_INNER_MARGIN_FRAC = 0.6;

/** Degenerate-galaxy guard: `ismMapRingRadius`'s log spacing needs rMax clear of rMin. */
const ISM_MAP_MIN_SPAN_RATIO = 2;

/**
 * The radius bounds one generated galaxy's log-radial grid spans. The outer
 * edge covers the outermost arm's `fadeRadius`, not `outerRadius`: dust is
 * ISM-map-seeded only where this grid has data, so stopping at
 * `outerRadius` leaves a hard edge mid-arm. Rings are log-spaced over a
 * fixed `ISM_MAP_RINGS`, so widening rMax spends radial resolution on the
 * newly-covered outer arm — raise `ISM_MAP_RINGS` if inner detail suffers.
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

/** Same bounds for a galaxy that may not be generated yet — the ismMap chain dispatches before geometry exists, and its grid must agree texel-for-texel with the orientation chain's. */
export function ismMapGridRadiusOrDefault(
  geometry: GalaxyDescription | null,
): GalaxyIsmMapGridRadius {
  return geometry ? ismMapGridRadius(geometry) : { rMin: 1e-3, rMax: 1 };
}

/**
 * Cross-track distance from a grid cell to an arm's ridge, disc-plane only
 * (matching `ismMapPresent.wesl`'s flat-plane resample). `r * angularOffset`
 * is a small-angle approximation, valid since `armCrossSigma` stays much
 * smaller than r on the arm's support.
 */
function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/** Gaussian support beyond this many sigma is exp(-12.5) ~ 4e-6 — invisible to every consumer (fluid forcing, fluid CDF). */
const CROSS_SIGMA_SUPPORT = 5;

/**
 * One record's (arm or spur) contribution to one ring's forcing row; `weight`
 * is an arm's full contribution (1) vs a spur's `gasWeight`-scaled one.
 *
 * `gateSpan`: a spur's root sits far out along its parent arm, so without
 * gating to its own `spanStartLogR` span, `armFadeEnvelope`'s inner ramp
 * (keyed off the galaxy's global `armStartRadius`) reads as already
 * saturated there — forcing gas in from the bulge as if the spur were a
 * full arm. Ordinary arms' spans already start near `armStartRadius`.
 */
function applyArmForcingRecord(
  out: Float32Array,
  rowBase: number,
  r: number,
  logR: number,
  geometry: GalaxyDescription,
  record: GalaxyFieldArmRecord,
  weight: number,
  sigmaAcross: number,
  halfWidthAz: number,
  gateSpan: boolean,
): void {
  if (gateSpan && r < geometry.armStartRadius * Math.exp(record.spanStartLogR)) return;
  const envelope = armFadeEnvelope(r, geometry, record);
  if (envelope <= 0) return;
  const point = armRidgeCurvePoint(logR, geometry, record);
  const ridgeAngle = Math.atan2(point[2], point[0]);

  // Iterate only the narrow az band, wrapping raw indices into
  // [0, ISM_MAP_AZ); the `azHi` clamp degrades gracefully to a full sweep
  // when the band is wide.
  const azCenter = (ridgeAngle / (2 * Math.PI)) * ISM_MAP_AZ;
  const azLo = Math.floor(azCenter - halfWidthAz);
  const azHi = Math.min(azLo + ISM_MAP_AZ - 1, Math.ceil(azCenter + halfWidthAz));

  for (let rawAz = azLo; rawAz <= azHi; rawAz++) {
    const az = ((rawAz % ISM_MAP_AZ) + ISM_MAP_AZ) % ISM_MAP_AZ;
    const theta = (2 * Math.PI * az) / ISM_MAP_AZ;
    const crossDist = r * wrapAngle(theta - ridgeAngle);
    const gauss = Math.exp(-0.5 * (crossDist / sigmaAcross) ** 2);
    const idx = rowBase + az;
    out[idx] = Math.min(1, out[idx]! + weight * envelope * gauss);
  }
}

function computeGalaxyIsmMapArmForcing(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): Float32Array {
  const { rMin, rMax } = ismMapGridRadius(geometry);
  const out = new Float32Array(ISM_MAP_AZ * ISM_MAP_RINGS);
  if (geometry.numArms <= 0) return out;

  const spurTuning = tuning.arms.spurs;
  // A preset saved between spurs shipping and `gasWeight` shipping carries
  // `spurs` with `gasWeight` missing (`migrateGalaxyFieldTuningWire` only
  // backfills a missing `arms` section wholesale). Same carve idiom as
  // `dustParticleCloud.ts`'s `redness ?? 1`.
  const gasWeight = spurTuning.gasWeight ?? 0.5;
  // Reseeds from `geometry.seed`, the same call `galaxyFieldMixture.ts` makes
  // for the rendered spurs, so this field's spur set agrees with theirs.
  const spurArms: readonly GalaxyFieldArmRecord[] =
    spurTuning.enabled && gasWeight > 0 ? buildArmSpurs(geometry, spurTuning, geometry.seed) : [];

  for (let ring = 0; ring < ISM_MAP_RINGS; ring++) {
    const r = ismMapRingRadius(ring, ISM_MAP_RINGS, rMin, rMax);
    if (r <= geometry.armStartRadius) continue;
    const logR = Math.log(r / geometry.armStartRadius);
    const sigmaAcross = Math.max(armCrossSigma(r, geometry, tuning), 1e-4);
    // Az-index half-width of the support band, shared by every arm/spur at
    // this ring (both r and sigmaAcross are ring-level, not record-level).
    const halfWidthAz = ((CROSS_SIGMA_SUPPORT * sigmaAcross) / r / (2 * Math.PI)) * ISM_MAP_AZ;
    const rowBase = ring * ISM_MAP_AZ;

    for (const arm of geometry.arms) {
      applyArmForcingRecord(
        out,
        rowBase,
        r,
        logR,
        geometry,
        arm,
        1,
        sigmaAcross,
        halfWidthAz,
        false,
      );
    }
    for (const spur of spurArms) {
      applyArmForcingRecord(
        out,
        rowBase,
        r,
        logR,
        geometry,
        spur,
        gasWeight,
        sigmaAcross,
        halfWidthAz,
        true,
      );
    }
  }
  return out;
}

/** Single-slot memo. Callers must treat the returned array as read-only. */
const forcingMemo = memoizeLastByKeys<Float32Array>();

export function buildGalaxyIsmMapArmForcing(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): Float32Array {
  const spurs = tuning.arms.spurs;
  // Only the fields `computeGalaxyIsmMapArmForcing` reads: `share`/
  // `sizeScale`/`elongation` steer the rendered spur sprites elsewhere and
  // don't change this field.
  const key: readonly unknown[] = [
    geometry,
    tuning.arms.widthScale,
    spurs.enabled,
    spurs.gasWeight,
    spurs.spacing,
    spurs.pitchRatio,
    spurs.lengthFrac,
    spurs.jitter,
  ];
  return forcingMemo.get(key, () => computeGalaxyIsmMapArmForcing(geometry, tuning));
}
