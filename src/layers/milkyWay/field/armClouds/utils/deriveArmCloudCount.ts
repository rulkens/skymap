/**
 * deriveArmCloudCount — the arm cloud's component-budget count; the sprites
 * themselves are GPU-placed (`placeArmCloud.wesl`), but `galaxyFieldMixture.ts`
 * reserves slots against this before sizing the ridge chain.
 */
import { armRidgeCurvePoint } from '../../arms/utils/armRidgeCurvePoint';
import { distance3 } from '../../../../../utils/math/distance3';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import { armFadeEnvelope } from '../../arms/utils/armFadeEnvelope';
import { armCrossSigma } from '../../arms/utils/armCrossSigma';
import { ARM_CLOUD_MAX_COUNT } from '../data/armCloudMaxCount';

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
