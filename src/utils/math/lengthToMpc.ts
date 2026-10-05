import type { Length } from '../../@types/data/Length';

const MPC_PER_UNIT = { pc: 1e-6, kpc: 1e-3, Mpc: 1 } as const;

/**
 * Convert a unit-tagged length to Mpc, the unit every runtime structure
 * record uses.
 */
export function lengthToMpc(length: Length): number {
  return length.value * MPC_PER_UNIT[length.unit];
}
