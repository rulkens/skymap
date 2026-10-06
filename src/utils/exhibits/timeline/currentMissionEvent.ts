import { missionEventMs } from './missionEventMs';
import { SAME_INSTANT_MS } from '../../../data/exhibits/sameInstantMs';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';

/** The last event at or before `ms`, give or take a clock round-trip (events sorted), or null. */
export function currentMissionEvent(
  events: readonly MissionEvent[],
  ms: number,
): MissionEvent | null {
  let current: MissionEvent | null = null;
  for (const event of events) {
    if (missionEventMs(event) > ms + SAME_INSTANT_MS) break;
    current = event;
  }
  return current;
}
