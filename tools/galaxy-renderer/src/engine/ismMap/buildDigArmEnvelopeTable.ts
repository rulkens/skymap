/**
 * buildDigArmEnvelopeTable — `hiiRegions.ts`'s `buildArmProximityEnvelope`
 * (:411-451), re-expressed as a packed per-(ring,arm) table instead of a
 * `(radius, angle) => number` closure — `ismMapDustCdfScan.wesl`'s
 * `armBiased` weight mode evaluates the envelope per-texel in-shader, built
 * for this consumer, so it needs the closure's own per-ring
 * intermediates (ridgeAngle/weight/invSigma) as DATA, not a callback.
 *
 * Same math as that closure's own `refresh(radius)`: age-weighted
 * `armFadeEnvelope` per arm, `armCrossSigma`'s own inverse width shared by
 * every arm at a ring (packed redundantly per-(ring,arm) anyway — see
 * `packIsmMapCdfArmEnvelope.ts`'s own doc for why the format doesn't special-
 * case that). Recomputed once per ring here (not cached against a single
 * last radius like the CPU closure) since this runs once per CDF-scan
 * dispatch (a tuning/map change), not once per placed particle.
 */
import { armAgeWeight } from '../../../../../src/services/engine/galaxyGenerator/v2/dustLaneFeatures';
import {
  armCrossSigma,
  armFadeEnvelope,
  armRidgeAngle,
} from '../../../../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';
import { ismMapRingRadius } from '../../../../../src/utils/galaxy/ismMapRingRadius';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
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
