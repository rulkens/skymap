/**
 * packSfMapFluidConstants — the constants uniform every `sfMapFluidStep.wesl`
 * dispatch of one rebuild reads. THAT FILE'S `SfMapFluidConstants` IS THE
 * OFFSET AUTHORITY — see `packSfMapAutomatonConstants.ts`'s own header for
 * why a wrong index is a silent failure, not a thrown one.
 *
 * 16 lanes for 14 members — the same round-up-to-a-whole-row convention as
 * the automaton's own constants packer.
 */
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxySfMapFluidParams } from '../../../../../src/@types/galaxy/GalaxySfMapFluidParams';

/** Float count of `sfMapFluidStep.wesl`'s `SfMapFluidConstants` — 12 members, rounded up to a whole 16-byte row. */
export const SF_MAP_FLUID_CONSTANTS_FLOATS = 16;

/** Byte size of the constants struct, for `createBuffer`. */
export const SF_MAP_FLUID_CONSTANTS_BUFFER_SIZE = SF_MAP_FLUID_CONSTANTS_FLOATS * 4;

export type SfMapFluidConstantsInput = {
  /** The radius bounds THIS rebuild's grid spans — every ring index is read against them. */
  readonly grid: GalaxySfMapGridRadius;
  readonly fluid: GalaxySfMapFluidParams;
};

export function packSfMapFluidConstants({
  grid,
  fluid,
}: SfMapFluidConstantsInput): Float32Array {
  const out = new Float32Array(SF_MAP_FLUID_CONSTANTS_FLOATS);

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

  // Slack past the struct, written rather than left to the allocator — same
  // convention as packSfMapAutomatonConstants.ts.
  for (let i = 14; i < SF_MAP_FLUID_CONSTANTS_FLOATS; i++) out[i] = 0;

  return out;
}
