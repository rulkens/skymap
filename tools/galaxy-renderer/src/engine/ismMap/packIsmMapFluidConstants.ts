/**
 * packIsmMapFluidConstants — the constants uniform every `ismMapFluidStep.wesl`
 * dispatch of one rebuild reads. THAT FILE'S `IsmMapFluidConstants` IS THE
 * OFFSET AUTHORITY — a lane written to the wrong index throws nothing, it
 * just ships garbage, and on WebKit a mislaid uniform drops the frame with
 * no error.
 *
 * 20 lanes for 18 members — the uniform address space rounds a struct's
 * size up to a multiple of 16 bytes, so lanes 18/19 are slack.
 */
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapFluidParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapFluidParams';

/** Float count of `ismMapFluidStep.wesl`'s `IsmMapFluidConstants` — 18 members, rounded up to a whole 16-byte row. */
export const ISM_MAP_FLUID_CONSTANTS_FLOATS = 20;

/** Byte size of the constants struct, for `createBuffer`. */
export const ISM_MAP_FLUID_CONSTANTS_BUFFER_SIZE = ISM_MAP_FLUID_CONSTANTS_FLOATS * 4;

export type IsmMapFluidConstantsInput = {
  /** The radius bounds THIS rebuild's grid spans — every ring index is read against them. */
  readonly grid: GalaxyIsmMapGridRadius;
  readonly fluid: GalaxyIsmMapFluidParams;
};

export function packIsmMapFluidConstants({ grid, fluid }: IsmMapFluidConstantsInput): Float32Array {
  const out = new Float32Array(ISM_MAP_FLUID_CONSTANTS_FLOATS);

  out[0] = grid.rMin;
  out[1] = grid.rMax;
  out[2] = fluid.corotationRadius;
  out[3] = fluid.shearStrength;
  out[4] = fluid.gasRegen;
  out[5] = fluid.emaRate;
  out[6] = fluid.curlStrength;
  out[7] = fluid.curlScale;
  out[8] = fluid.impulseDuration;
  out[9] = fluid.armGather;
  out[10] = fluid.diffusion;
  out[11] = fluid.armDrag;
  out[12] = fluid.gasScaleLength;
  out[13] = fluid.gasFloor;
  out[14] = fluid.laneBias;
  out[15] = fluid.gatherOffset;
  out[16] = fluid.starsDeposit;
  out[17] = fluid.starsDecay;

  // Slack past the struct, written rather than left to the allocator: this
  // is the shape the buffer holds, not an artifact of how the array was made.
  out[18] = 0;
  out[19] = 0;

  return out;
}
