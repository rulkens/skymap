/**
 * SAMPLED_BODIES — the craft whose position comes from a loaded ephemeris track
 * instead of orbital elements; ids match `trajectoryRegistry` track ids.
 * `trailColor` is the craft's trail tint (linear HDR), the one source for it.
 */

import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { SampledBody } from '../../@types/missions/SampledBody';
import { VOYAGER_1_GOLD, VOYAGER_2_AMBER } from '../bodies/palette';
import { MISSION_EVENTS } from './missionEvents.generated';

/** Cape Canaveral Launch Complex 41, where both Voyagers' Titan IIIE lifted off. */
const CAPE_CANAVERAL_LC41: LonLatDeg = { latDeg: 28.583, lonDeg: -80.583 };

// The cited launch instant, not a re-typed copy of it.
function launchIso(id: string): string {
  const launch = MISSION_EVENTS.find((e) => e.bodyId === id && e.kind === 'launch');
  if (!launch) throw new Error(`spacecraftBodies: no launch event for '${id}'`);
  return launch.iso;
}

export const SAMPLED_BODIES: readonly SampledBody[] = [
  {
    id: 'voyager1',
    trailColor: VOYAGER_1_GOLD,
    launchIso: launchIso('voyager1'),
    launchPad: CAPE_CANAVERAL_LC41,
  },
  {
    id: 'voyager2',
    trailColor: VOYAGER_2_AMBER,
    launchIso: launchIso('voyager2'),
    launchPad: CAPE_CANAVERAL_LC41,
  },
];
