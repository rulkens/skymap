/**
 * buildDigArmEnvelopeTable — `hiiRegions.ts`'s `buildArmProximityEnvelope`,
 * re-expressed as a packed per-(ring,arm) table instead of a
 * `(radius, angle) => number` closure: `ismMapDustCdfScan.wesl`'s
 * `armBiased` weight mode needs the closure's own per-ring intermediates
 * (ridgeAngle/weight/invSigma) as DATA to evaluate per-texel in-shader. Same
 * math as that closure's `refresh(radius)`, but recomputed once per ring
 * here rather than cached against a single last radius, since this runs
 * once per CDF-scan dispatch, not once per placed particle.
 */
import { armAgeWeight } from '../../../../engine/galaxyGenerator/v2/dustLaneFeatures';
import {
  armCrossSigma,
  armFadeEnvelope,
  armRidgeAngle,
} from '../../../../engine/galaxyGenerator/v2/armRidgeGeometry';
import { ismMapRingRadius } from '../../../../../utils/galaxy/ismMapRingRadius';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../@types/galaxy/GalaxyFieldTuning';
import type { IsmMapCdfArmEnvelopeEntry } from './packIsmMapCdfArmEnvelope';

export function buildDigArmEnvelopeTable(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  grid: { readonly rings: number; readonly rMin: number; readonly rMax: number },
): readonly IsmMapCdfArmEnvelopeEntry[] {
  const arms = geometry.arms;
  const armCount = arms.length;
  if (armCount === 0) return [];

  const ageWeights = arms.map((arm) => armAgeWeight(arm));
  const maxAgeWeight = Math.max(...ageWeights);

  const out: IsmMapCdfArmEnvelopeEntry[] = new Array(grid.rings * armCount);
  for (let ring = 0; ring < grid.rings; ring++) {
    const radius = ismMapRingRadius(ring, grid.rings, grid.rMin, grid.rMax);
    const logR = Math.log(radius / geometry.armStartRadius);
    const sigma = armCrossSigma(radius, geometry, tuning);
    const invSigma = sigma > 0 ? 1 / sigma : 0;
    for (let a = 0; a < armCount; a++) {
      const arm = arms[a]!;
      out[ring * armCount + a] = {
        ridgeAngle: armRidgeAngle(logR, geometry, arm),
        weight: (ageWeights[a]! / maxAgeWeight) * armFadeEnvelope(radius, geometry, arm),
        invSigma,
      };
    }
  }
  return out;
}
