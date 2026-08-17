/**
 * Budget half of the arm-spur-cloud tier — the sprites themselves are
 * GPU-placed (`placeArmSpurCloud.wesl`, Task 14); this file survives only as
 * `spurFootprintIntegral`/`deriveArmSpurCloudCount`'s budget math, which
 * `galaxyFieldMixture.ts` still needs to reserve component slots before it
 * sizes the ridge chain, and `packArmSpurCloudRecords.ts` (the GPU dispatch
 * host's pick-weight packer) still calls into directly.
 */
import { armCrossSigma, armFadeEnvelope, armRidgeCurvePoint } from './armRidgeGeometry';
import { distance3 } from '../../../../utils/math/distance3';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';

/** Coarser than `armParticleCloud.ts`'s `ARM_COVERAGE_SAMPLES` (48): a spur's own span is a small fraction of a full arm's, smooth over its own steeper pitch too, so fewer samples already bound the arc-length integral tightly. */
const SPUR_COVERAGE_SAMPLES = 12;

/**
 * Fixed nominal covering factor. Unlike the arm cloud, spurs carry no
 * `coverage` slider of their own — `sizeScale` and `elongation` (this tier's
 * only density levers) already move the covering fraction inversely, and a
 * feature meant to read as a handful of short feathers doesn't need a second
 * knob for "how many". Calibrated so a mid-disc spur under the shipped
 * defaults reads as a few-sprite feather, not a re-run of the arm cloud.
 */
const SPUR_COVERAGE = 1.1;

/** Per-galaxy ceiling, well under `ARM_CLOUD_MAX_COUNT` (2000): spurs are the accent tier, not a second arm cloud. */
export const SPUR_CLOUD_MAX_COUNT = 400;

/** Sprite radius as a fraction of the LOCAL `armCrossSigma` — same draw range `armParticleCloud.ts` uses. */
const SIZE_MIN_RATIO = 0.35;
const SIZE_MAX_RATIO = 1.0;
const MEAN_SIZE_FRAC_SQ =
  (SIZE_MIN_RATIO ** 2 + SIZE_MIN_RATIO * SIZE_MAX_RATIO + SIZE_MAX_RATIO ** 2) / 3;

/**
 * This spur's own arc-length x inverse-width integral — the same trapezoid
 * `deriveArmCloudCount` runs over a whole arm, scoped to one spur's short
 * span. Shared by the count derivation and the build's own per-spur pick
 * weights, so the two can never disagree about which spurs get more
 * sprites. Exported for `packArmSpurCloudRecords.ts` (the GPU dispatch
 * host's CPU-side weight-table packer, per the plan's "port this integral
 * into the packer, not the shader" contract) — same weights, one function.
 */
export function spurFootprintIntegral(
  spur: GalaxyFieldArmRecord,
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  const logStart = spur.spanStartLogR;
  const logEnd = Math.log(spur.fadeRadius / geometry.armStartRadius);
  if (logEnd <= logStart) return 0;
  const duSample = (logEnd - logStart) / (SPUR_COVERAGE_SAMPLES - 1);
  let prevPoint = armRidgeCurvePoint(logStart, geometry, spur);
  let prevIntegrand =
    armFadeEnvelope(geometry.armStartRadius * Math.exp(logStart), geometry, spur) /
    armCrossSigma(geometry.armStartRadius * Math.exp(logStart), geometry, tuning);
  let integral = 0;
  for (let i = 1; i < SPUR_COVERAGE_SAMPLES; i++) {
    const logR = logStart + duSample * i;
    const radius = geometry.armStartRadius * Math.exp(logR);
    const point = armRidgeCurvePoint(logR, geometry, spur);
    const integrand =
      armFadeEnvelope(radius, geometry, spur) / armCrossSigma(radius, geometry, tuning);
    integral += 0.5 * (prevIntegrand + integrand) * distance3(prevPoint, point);
    prevPoint = point;
    prevIntegrand = integrand;
  }
  return integral;
}

/**
 * Component-budget count this tier will spend, summed across every spur —
 * `buildGalaxyFieldMixture` reserves exactly this many slots before sizing
 * the ridge chain, the `deriveArmCloudCount` pattern.
 */
export function deriveArmSpurCloudCount(
  spurArms: readonly GalaxyFieldArmRecord[],
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  const spurTuning = tuning.arms.spurs;
  if (spurArms.length === 0 || spurTuning.elongation <= 0 || spurTuning.sizeScale <= 0) return 0;
  const footprintFactor =
    Math.PI * spurTuning.elongation * spurTuning.sizeScale ** 2 * MEAN_SIZE_FRAC_SQ;
  let total = 0;
  for (const spur of spurArms) total += 2 * spurFootprintIntegral(spur, geometry, tuning);
  return Math.min(
    SPUR_CLOUD_MAX_COUNT,
    Math.max(0, Math.round((SPUR_COVERAGE * total) / footprintFactor)),
  );
}
