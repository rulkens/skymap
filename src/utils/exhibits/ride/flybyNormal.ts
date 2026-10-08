/**
 * flybyNormal — unit normal of the encounter plane, normalize(r × v) of craft relative to target
 * at the event instant. Fixed per event, so the camera does not swing as the craft bends.
 */

import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import type { Vec3 } from '../../../@types/math/Vec3';
import { cross3 } from '../../math/cross3';
import { normalize3 } from '../../math/normalize3';
import { unixMsToJulianDays } from '../../time/unixMsToJulianDays';
import { missionEventMs } from '../timeline/missionEventMs';
import { flybyRelativeState } from './flybyRelativeState';

export function flybyNormal(event: MissionEvent): Vec3 | null {
  const state = flybyRelativeState(event, unixMsToJulianDays(missionEventMs(event)));
  return state === null ? null : normalize3(cross3(state.rKm, state.vKmS));
}
