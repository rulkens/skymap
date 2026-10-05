import { missionEventMs } from './missionEventMs';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';

/**
 * Half a second: a clock just set to an event's instant must not count that event as still
 * ahead or behind, and the Julian-day round trip loses tens of microseconds.
 */
const SAME_INSTANT_MS = 500;

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
