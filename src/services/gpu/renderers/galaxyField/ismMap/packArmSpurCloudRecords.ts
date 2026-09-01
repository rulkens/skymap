/**
 * packArmSpurCloudRecords — the per-spur storage buffer
 * placeArmSpurCloud.wesl's `SpurRecord` reads, plus the pick-weight sum
 * `pickWeighted`'s port normalises against. `weight` is
 * `spurFootprintIntegral(spur, geometry, tuning)` — armSpurParticleCloud.ts's
 * own per-spur pick weight — computed HERE, not in the shader, which only
 * ever reads the resulting table. THAT FILE'S `SpurRecord` IS THE OFFSET
 * AUTHORITY — 8 floats/record (2 vec4 rows): phase, pitch, fadeRadius,
 * spanStartLogR | age, weight, pad, pad.
 */
import { spurFootprintIntegral } from '../../../../engine/galaxyGenerator/v2/armSpurParticleCloud';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../@types/galaxy/GalaxyFieldTuning';

/** Float count of one `SpurRecord` — 2 vec4 rows. */
export const ARM_SPUR_CLOUD_RECORD_FLOATS = 8;

export type ArmSpurCloudRecords = {
  readonly buffer: Float32Array;
  /** Sum of every spur's own weight — `packPlaceArmSpurCloudParams.ts`'s `weightSum` input. */
  readonly weightSum: number;
};

export function packArmSpurCloudRecords(
  spurArms: readonly GalaxyFieldArmRecord[],
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): ArmSpurCloudRecords {
  const buffer = new Float32Array(spurArms.length * ARM_SPUR_CLOUD_RECORD_FLOATS);
  let weightSum = 0;
  for (let i = 0; i < spurArms.length; i++) {
    const spur = spurArms[i]!;
    const weight = spurFootprintIntegral(spur, geometry, tuning);
    weightSum += weight;
    const o = i * ARM_SPUR_CLOUD_RECORD_FLOATS;
    buffer[o + 0] = spur.phase;
    buffer[o + 1] = spur.pitch;
    buffer[o + 2] = spur.fadeRadius;
    buffer[o + 3] = spur.spanStartLogR;
    buffer[o + 4] = spur.age;
    buffer[o + 5] = weight;
    buffer[o + 6] = 0; // _pad0
    buffer[o + 7] = 0; // _pad1
  }
  return { buffer, weightSum };
}
