import type { MissionEvent } from '../../../@types/missions/MissionEvent';
import { MISSION_FLYBY_LEAD_DAYS } from '../../../data/exhibits/mission/missionFlybyLeadDays';
import { DAY_MS } from '../../../data/time/dayMs';
import { missionEventMs } from './missionEventMs';

/**
 * Where a step to `event` lands the clock: a flyby's lead-in before closest approach, any other
 * event's own instant. The card and the step order read events at this instant too, so a flyby
 * is current from the moment a step lands on it.
 */
export function missionEventStepMs(event: MissionEvent): number {
  const lead = event.kind === 'flyby' ? MISSION_FLYBY_LEAD_DAYS * DAY_MS : 0;
  return missionEventMs(event) - lead;
}
