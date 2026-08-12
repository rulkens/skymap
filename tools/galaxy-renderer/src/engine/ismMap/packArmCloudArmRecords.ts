/**
 * packArmCloudArmRecords — the per-arm storage buffer placeArmCloud.wesl's
 * `ArmCloudArmRecord` reads, plus the pick-weight sum `pickWeighted`'s port
 * normalises against. `weight` is `armAgeWeight(arm)` — clusteredDiscPlacement.ts's
 * own per-arm pick weight — computed HERE (packArmSpurCloudRecords.ts's own
 * "port the weight into the packer, not the shader" contract) rather than in
 * the shader, which only ever reads the resulting table.
 *
 * THAT FILE'S `ArmCloudArmRecord` IS THE OFFSET AUTHORITY — 12 floats/record
 * (3 vec4 rows): phase, pitch, meanderAmp, meanderFreq | meanderPhase, waveF1,
 * waveP1, waveF2 | waveP2, fadeRadius, spanStartLogR, weight.
 */
import { armAgeWeight } from '../../../../../src/services/engine/galaxyGenerator/v2/dustLaneFeatures';
import type { GalaxyFieldArmRecord } from '../../../../../src/@types/galaxy/GalaxyFieldArmRecord';

/** Float count of one `ArmCloudArmRecord` — 3 vec4 rows. */
export const ARM_CLOUD_ARM_RECORD_FLOATS = 12;

export type ArmCloudArmRecords = {
  readonly buffer: Float32Array;
  /** Sum of every arm's own weight — `packPlaceArmCloudParams.ts`'s `armWeightSum` input. */
  readonly weightSum: number;
};

export function packArmCloudArmRecords(arms: readonly GalaxyFieldArmRecord[]): ArmCloudArmRecords {
  const buffer = new Float32Array(arms.length * ARM_CLOUD_ARM_RECORD_FLOATS);
  let weightSum = 0;
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i]!;
    const weight = armAgeWeight(arm);
    weightSum += weight;
    const o = i * ARM_CLOUD_ARM_RECORD_FLOATS;
    buffer[o + 0] = arm.phase;
    buffer[o + 1] = arm.pitch;
    buffer[o + 2] = arm.meanderAmp;
    buffer[o + 3] = arm.meanderFreq;
    buffer[o + 4] = arm.meanderPhase;
    buffer[o + 5] = arm.waveF1;
    buffer[o + 6] = arm.waveP1;
    buffer[o + 7] = arm.waveF2;
    buffer[o + 8] = arm.waveP2;
    buffer[o + 9] = arm.fadeRadius;
    buffer[o + 10] = arm.spanStartLogR;
    buffer[o + 11] = weight;
  }
  return { buffer, weightSum };
}
