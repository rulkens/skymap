import { missionEventMs } from './missionEventMs';
import { SAME_INSTANT_MS } from '../../../data/exhibits/sameInstantMs';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';

/** The id of the nearest event strictly before (-1) or after (+1) `simMs`; null at either end. */
export function adjacentEventId(
  events: readonly MissionEvent[],
  simMs: number,
  dir: -1 | 1,
): string | null {
  const ordered = dir === 1 ? events : [...events].reverse();
  return (
    ordered.find((e) =>
      dir === 1
        ? missionEventMs(e) > simMs + SAME_INSTANT_MS
        : missionEventMs(e) < simMs - SAME_INSTANT_MS,
    )?.id ?? null
  );
}
