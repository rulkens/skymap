import { armRidgeCurvePoint } from '../../arms/utils/armRidgeCurvePoint';
import { distance3 } from '../../../../../utils/math/distance3';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import { armFadeEnvelope } from '../../arms/utils/armFadeEnvelope';
import { armCrossSigma } from '../../arms/utils/armCrossSigma';

/** Coarser than `deriveArmCloudCount.ts`'s `ARM_COVERAGE_SAMPLES` (48): a spur's own span is a small fraction of a full arm's, smooth over its own steeper pitch too, so fewer samples already bound the arc-length integral tightly. */
const SPUR_COVERAGE_SAMPLES = 12;

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
