/**
 * SAMPLED_BODIES — the craft whose position comes from a loaded ephemeris track
 * instead of orbital elements; ids match `trajectoryRegistry` track ids.
 * `trailColor` is the craft's trail tint (linear HDR), the one source for it.
 */

import type { SampledBody } from '../../@types/missions/SampledBody';
import { VOYAGER_1_GOLD, VOYAGER_2_AMBER } from '../bodies/palette';

export const SAMPLED_BODIES: readonly SampledBody[] = [
  { id: 'voyager1', trailColor: VOYAGER_1_GOLD },
  { id: 'voyager2', trailColor: VOYAGER_2_AMBER },
];
