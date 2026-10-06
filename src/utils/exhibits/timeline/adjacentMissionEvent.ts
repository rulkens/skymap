import { missionEventMs } from './missionEventMs';
import { SAME_INSTANT_MS } from '../../../data/exhibits/sameInstantMs';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';

/** The nearest event strictly before (-1) or after (+1) `ms`; null at either end. */
export function adjacentMissionEvent(
  events: readonly MissionEvent[],
  ms: number,
  direction: -1 | 1,
): MissionEvent | null {
  const ordered = direction === 1 ? events : [...events].reverse();
  return (
    ordered.find((e) =>
      direction === 1
        ? missionEventMs(e) > ms + SAME_INSTANT_MS
        : missionEventMs(e) < ms - SAME_INSTANT_MS,
    ) ?? null
  );
}
