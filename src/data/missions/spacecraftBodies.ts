/**
 * SAMPLED_BODIES — the craft whose position comes from a loaded ephemeris track
 * instead of orbital elements; ids match `trajectoryRegistry` track ids.
 * `trailColor` is the craft's trail tint (linear HDR), the one source for it.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { VOYAGER_1_GOLD, VOYAGER_2_AMBER } from '../bodies/palette';

export const SAMPLED_BODIES: readonly { readonly id: string; readonly trailColor: Vec3 }[] = [
  { id: 'voyager1', trailColor: VOYAGER_1_GOLD },
  { id: 'voyager2', trailColor: VOYAGER_2_AMBER },
];
