/**
 * packIsmMapAutomatonConstants — the constants uniform every
 * `ismMapAutomatonStep.wesl` dispatch of one rebuild reads. THAT FILE'S
 * `IsmMapConstants` IS THE OFFSET AUTHORITY; a lane written to the wrong
 * index throws nothing, it just ships garbage, and on WebKit a mislaid
 * uniform drops the frame with no error at all.
 *
 * 16 lanes for 14 members (12-13 were slack when the struct had 13; one is
 * spent on `dustFloorFraction` now, see 06-ca-dust-channel-sketch.md) — the
 * struct's real minimum binding size is smaller than the 16-lane round-up,
 * so the remaining tail is slack, not padding the layout requires.
 */
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapAutomatonParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapAutomatonParams';

/** Float count of `ismMapAutomatonStep.wesl`'s `IsmMapConstants` — 13 members, rounded up to a whole 16-byte row. */
export const ISM_MAP_AUTOMATON_CONSTANTS_FLOATS = 16;

/** Byte size of the constants struct, for `createBuffer`. */
export const ISM_MAP_AUTOMATON_CONSTANTS_BUFFER_SIZE = ISM_MAP_AUTOMATON_CONSTANTS_FLOATS * 4;

export type IsmMapAutomatonConstantsInput = {
  /** The radius bounds THIS rebuild's grid spans — every ring index is read against them. */
  readonly grid: GalaxyIsmMapGridRadius;
  readonly ismMap: GalaxyIsmMapAutomatonParams;
  /** Hashed with (cell, step) and nothing else, so one seed reproduces one map. */
  readonly seed: number;
};

export function packIsmMapAutomatonConstants({
  grid,
  ismMap,
  seed,
}: IsmMapAutomatonConstantsInput): Float32Array {
  const out = new Float32Array(ISM_MAP_AUTOMATON_CONSTANTS_FLOATS);

  out[0] = grid.rMin;
  out[1] = grid.rMax;
  out[2] = ismMap.corotationRadius;
  out[3] = ismMap.shearRate;
  out[4] = ismMap.baseIgnition;
  out[5] = ismMap.spread;
  out[6] = ismMap.armForcing;
  out[7] = ismMap.gasRegen;
  out[8] = ismMap.refractorySteps;
  out[9] = seed;
  out[10] = ismMap.armFluxRef;
  out[11] = ismMap.activityDecay;
  out[12] = ismMap.activityGain;
  out[13] = ismMap.dustFloorFraction;

  // Slack past the struct, written rather than left to the allocator: this is
  // the shape the buffer holds, not an artifact of how the array was made.
  out[14] = 0;
  out[15] = 0;

  return out;
}
