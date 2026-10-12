import type { Length } from '../../@types/data/Length';
import { MPC_PER_LENGTH_UNIT } from '../../data/mpcPerLengthUnit';

/**
 * Convert a unit-tagged length to Mpc, the unit every runtime structure
 * record uses.
 */
export function lengthToMpc(length: Length): number {
  return length.value * MPC_PER_LENGTH_UNIT[length.unit];
}
