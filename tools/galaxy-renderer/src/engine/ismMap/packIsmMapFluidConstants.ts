/**
 * packIsmMapFluidConstants — the constants uniform every `ismMapFluidStep.wesl`
 * dispatch of one rebuild reads. THAT FILE'S `IsmMapFluidConstants` IS THE
 * OFFSET AUTHORITY — see `packIsmMapAutomatonConstants.ts`'s own header for
 * why a wrong index is a silent failure, not a thrown one.
 *
 * 16 lanes for 16 members — `gatherOffset` (member 16) exactly fills the
 * buffer; the round-up-to-a-whole-row slack the automaton's own constants
 * packer still carries is gone here.
 */
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapFluidParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapFluidParams';

/** Float count of `ismMapFluidStep.wesl`'s `IsmMapFluidConstants` — 12 members, rounded up to a whole 16-byte row. */
export const ISM_MAP_FLUID_CONSTANTS_FLOATS = 16;

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

  return out;
}
