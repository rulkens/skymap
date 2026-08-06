/**
 * packIsmMapUnshear — the uniform `ismMapPack.wesl` un-shears the automaton's
 * final material-frame state with. THAT FILE'S `IsmMapUnshear` IS THE OFFSET
 * AUTHORITY; a lane written to the wrong index throws nothing, it just ships
 * garbage, and on WebKit a mislaid uniform drops the frame with no error.
 *
 * 8 lanes for 5 members: the struct is 20 bytes, which is all Dawn's minimum
 * binding size demands — the tail is slack, not required padding.
 */
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapAutomatonParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapAutomatonParams';

/** Float count of `ismMapPack.wesl`'s `IsmMapUnshear` — 5 members, rounded up to whole 16-byte rows. */
export const ISM_MAP_UNSHEAR_FLOATS = 8;

/** Byte size of the un-shear struct, for `createBuffer`. */
export const ISM_MAP_UNSHEAR_BUFFER_SIZE = ISM_MAP_UNSHEAR_FLOATS * 4;

export type IsmMapUnshearInput = {
  /** Same bounds the step pass ran against — the inverse transform is read on the same grid. */
  readonly grid: GalaxyIsmMapGridRadius;
  readonly ismMap: Pick<GalaxyIsmMapAutomatonParams, 'corotationRadius' | 'shearRate'>;
  /**
   * Shear-applying generations the final state accumulated, NOT the raw step
   * count: step 0 only seeds (`ismMapAutomatonStep.wesl`), so the caller
   * passes `steps - 1`.
   */
  readonly totalShiftSteps: number;
};

export function packIsmMapUnshear({
  grid,
  ismMap,
  totalShiftSteps,
}: IsmMapUnshearInput): Float32Array {
  const out = new Float32Array(ISM_MAP_UNSHEAR_FLOATS);

  out[0] = grid.rMin;
  out[1] = grid.rMax;
  out[2] = ismMap.corotationRadius;
  out[3] = ismMap.shearRate;
  out[4] = totalShiftSteps;

  // Slack past the struct, written rather than left to the allocator: this is
  // the shape the buffer holds, not an artifact of how the array was made.
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;

  return out;
}
