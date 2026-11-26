/**
 * flybyOutsideBend — unit direction from the target to the craft at closest approach: the outside
 * of the trajectory's bend. Fixed per event, so a view built on it does not swing as the craft turns.
 */

import type { TimelineEvent } from '../../../@types/exhibits/timeline/TimelineEvent';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import { normalize3 } from '../../../../packages/shared/src/utils/math/normalize3';
import { unixMsToJulianDays } from '../../time/unixMsToJulianDays';
import { timelineEventMs } from '../../exhibits/timeline/timelineEventMs';
import { bodyRelativeState } from './bodyRelativeState';

export function flybyOutsideBend(event: TimelineEvent): Vec3 | null {
  if (event.targetId === undefined) return null;
  const state = bodyRelativeState(
    event.bodyId,
    event.targetId,
    unixMsToJulianDays(timelineEventMs(event)),
  );
  return state === null ? null : normalize3(state.rKm);
}
