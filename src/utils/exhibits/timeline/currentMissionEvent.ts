import { missionEventMs } from './missionEventMs';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';

/** The last event at or before `ms` (events sorted by time), or null before the first. */
export function currentMissionEvent(
  events: readonly MissionEvent[],
  ms: number,
): MissionEvent | null {
  let current: MissionEvent | null = null;
  for (const event of events) {
    if (missionEventMs(event) > ms) break;
    current = event;
  }
  return current;
}
