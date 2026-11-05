import { MILKY_WAY_DISC_RADIUS_KPC } from './galacticCenter';

/**
 * Disk radius in Mpc — the kpc → Mpc form of the physical fact in
 * `galacticCenter.ts`. The rendered cloud, the pick billboard, the selection
 * ring and the distance bands all size from this one number.
 */
export const MILKY_WAY_RADIUS_MPC = MILKY_WAY_DISC_RADIUS_KPC / 1000;
