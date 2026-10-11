/**
 * flybyOutsideBend — unit direction from the target to the craft at closest approach: the outside
 * of the trajectory's bend. Fixed per event, so a view built on it does not swing as the craft turns.
 */

import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import type { Vec3 } from '../../../@types/math/Vec3';
import { normalize3 } from '../../math/normalize3';
import { unixMsToJulianDays } from '../../time/unixMsToJulianDays';
import { missionEventMs } from '../timeline/missionEventMs';
import { bodyRelativeState } from './bodyRelativeState';

export function flybyOutsideBend(event: MissionEvent): Vec3 | null {
  if (event.targetId === undefined) return null;
  const state = bodyRelativeState(
    event.bodyId,
    event.targetId,
    unixMsToJulianDays(missionEventMs(event)),
  );
  return state === null ? null : normalize3(state.rKm);
}
