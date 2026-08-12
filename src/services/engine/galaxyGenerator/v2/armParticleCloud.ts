/**
 * Budget half of the arm-cloud tier — the sprites themselves are GPU-placed
 * (`placeArmCloud.wesl`, Task 13); this file's placement BODY
 * (`buildArmParticleCloud`) is gone, but it still hosts the budget math
 * (`deriveArmCloudCount`, which `galaxyFieldMixture.ts` reserves component
 * slots against) and the radial-tilt/clustering-scale constants
 * `createIsmMapPlaceArmCloud.ts` packs into `placeArmCloud.wesl`'s own
 * uniforms and `probeGpuErrors.ts` re-derives independently to verify the
 * GPU's flux-conservation output.
 */
import { armCrossSigma, armFadeEnvelope, armRidgeCurvePoint } from './armRidgeGeometry';
import { distance3 } from '../../../../utils/math/distance3';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';

/**
 * Component-budget ceiling. `galaxyFieldMixture.ts` reserves exactly this
 * many slots (`pushArmRidges`' `reservedComponents`) before sizing the ridge
 * chain, so a huge derived count (`deriveArmCloudCount`) clamps here rather
 * than overflowing `GALAXY_FIELD_MAX_COMPONENTS`. Sized so the coverage
 * slider leads and this stays a backstop — at 400 the Milky Way preset
 * saturated around coverage 2.7, reading as a dead slider rather than a
 * budget hit.
 */
export const ARM_CLOUD_MAX_COUNT = 2000;

/** Sprite radius as a fraction of the local `armCrossSigma`, drawn uniform (see module docblock for why a ratio, not an absolute span). */
const SIZE_MIN_RATIO = 0.35;
const SIZE_MAX_RATIO = 1.0;

/** E[U(SIZE_MIN_RATIO, SIZE_MAX_RATIO)^2] = (a^2+ab+b^2)/3 — the size draw's mean square, feeding `deriveArmCloudCount`'s footprint below. */
const MEAN_SIZE_FRAC_SQ =
  (SIZE_MIN_RATIO ** 2 + SIZE_MIN_RATIO * SIZE_MAX_RATIO + SIZE_MAX_RATIO ** 2) / 3;

/** Ridge samples for the coverage integral below — arc length and local width are both smooth in log-radius, so a coarse sample suffices. */
const ARM_COVERAGE_SAMPLES = 48;

/**
 * The covering-factor integral behind `GalaxyArmCloudTuning.coverage` — the
 * same f = N * <sprite footprint> / area argument `dustParticleCloud.ts`
 * documents for the dust tier.
 *
 * Per arc-length element ds at radius r the strip area is `2 *
 * armCrossSigma(r) * ds`, fade-weighted so a faded outer arm doesn't demand
 * sprites nothing will see; a sprite there has mean footprint `PI *
 * elongation * armCrossSigma(r)^2 * sizeScale^2 * MEAN_SIZE_FRAC_SQ`.
 * Dividing cancels one power of armCrossSigma(r), evaluated by trapezoid
 * over a log-radius ridge sample and summed across arms.
 *
 * `cloud.radialBias` is deliberately absent: it moves sprites without
 * resizing the arm, so demand is unchanged.
 */
export function deriveArmCloudCount(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): number {
  if (
    geometry.numArms <= 0 ||
    tuning.arms.cloud.elongation <= 0 ||
    tuning.arms.cloud.sizeScale <= 0 ||
    tuning.arms.cloud.coverage <= 0
  ) {
    return 0;
  }
  const footprintFactor =
    Math.PI * tuning.arms.cloud.elongation * tuning.arms.cloud.sizeScale ** 2 * MEAN_SIZE_FRAC_SQ;

  let total = 0;
  for (const arm of geometry.arms) {
    const logStart = arm.spanStartLogR;
    const rStart = geometry.armStartRadius * Math.exp(logStart);
    const rEnd = arm.fadeRadius;
    if (rEnd <= rStart) continue;
    const logEnd = Math.log(rEnd / geometry.armStartRadius);
    const duSample = (logEnd - logStart) / (ARM_COVERAGE_SAMPLES - 1);

    let prevPoint = armRidgeCurvePoint(logStart, geometry, arm);
    let prevIntegrand =
      armFadeEnvelope(rStart, geometry, arm) / armCrossSigma(rStart, geometry, tuning);
    let armIntegral = 0;
    for (let i = 1; i < ARM_COVERAGE_SAMPLES; i++) {
      const logR = logStart + duSample * i;
      const radius = geometry.armStartRadius * Math.exp(logR);
      const point = armRidgeCurvePoint(logR, geometry, arm);
      const integrand =
        armFadeEnvelope(radius, geometry, arm) / armCrossSigma(radius, geometry, tuning);
      armIntegral += 0.5 * (prevIntegrand + integrand) * distance3(prevPoint, point);
      prevPoint = point;
      prevIntegrand = integrand;
    }
    total += (2 * armIntegral) / footprintFactor;
  }
  return Math.min(ARM_CLOUD_MAX_COUNT, Math.max(0, Math.round(tuning.arms.cloud.coverage * total)));
}

/** Complex-level vertical scatter, a fraction of the disc's own height — matches `pushArmRidges`' calibrated arm-population thickness (its own `sigmas.pole = diskHeight * 0.8`). Packed by `createIsmMapPlaceArmCloud.ts` into `placeArmCloud.wesl`'s own uniforms. */
export const COMPLEX_HEIGHT_RATIO = 0.8;

/** One complex's child scatter, as a fraction of the LOCAL arm width at a representative radius — mirrors the size draw's own reasoning: arm width sets every other length scale here, not an absolute pc span. Packed by `createIsmMapPlaceArmCloud.ts` into `placeArmCloud.wesl`'s own uniforms. */
export const COMPLEX_SPREAD_RATIO = 0.6;

/**
 * Reference radius for the radial tilt: the outermost arm's own fade
 * radius, so `(radius / this) ** bias` never exceeds 1 anywhere a complex
 * can be proposed — a weight above 1 would silently flatten the sampler's
 * rejection test into a uniform tail instead of erroring.
 *
 * One reference across all arms, not each arm's own fadeRadius, so the tilt
 * can't redistribute light between arms of different lengths. Packed by
 * `createIsmMapPlaceArmCloud.ts` into `placeArmCloud.wesl`'s own uniforms
 * (`tiltRefRadius`) and re-derived by `probeGpuErrors.ts` to verify the
 * GPU's flux-conservation output independently.
 */
export function tiltReferenceRadius(geometry: GalaxyDescription): number {
  let max = 0;
  for (const arm of geometry.arms) max = Math.max(max, arm.fadeRadius);
  return max > 0 ? max : geometry.armStartRadius;
}

/**
 * Floor on the radial tilt, and so a ceiling of 1/this on how much flux one
 * sprite can be handed relative to an outer one. The tilt suppresses inner
 * placements and the flux weight divides the same factor back out — exact
 * in expectation but unbounded in variance: at bias 3 an inner sprite
 * survives with probability ~0.007 and would then carry ~138x an outer
 * sprite's flux, reading as a bright knot inside the bulge. Applied to both
 * sides so the cancellation stays exact.
 */
const TILT_FLOOR = 0.05;

/**
 * The radial tilt at a radius — ONE definition, mirrored into
 * `placeArmCloud.wesl`'s own `cdpRadialTilt` (the placement acceptance and
 * the flux weight that cancels it both read the SAME formula there) and
 * re-derived here by `probeGpuErrors.ts` to verify the GPU's
 * flux-conservation output independently of the shader under test.
 */
export function radialTilt(radius: number, referenceRadius: number, bias: number): number {
  if (bias <= 0) return 1;
  return Math.max(TILT_FLOOR, (Math.max(radius, 0) / referenceRadius) ** bias);
}
