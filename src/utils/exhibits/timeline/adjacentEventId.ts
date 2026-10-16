import { missionEventStepMs } from './missionEventStepMs';
import { SAME_INSTANT_MS } from '../../../data/exhibits/sameInstantMs';
import type { MissionEvent } from '../../../@types/missions/MissionEvent';

/**
 * The id of the nearest event whose step instant lies strictly before (-1) or after (+1)
 * `simMs`; null at either end. Step instants, so a step to a flyby's lead-in counts as at it.
 */
export function adjacentEventId(
  events: readonly MissionEvent[],
  simMs: number,
  dir: -1 | 1,
): string | null {
  const ordered = dir === 1 ? events : [...events].reverse();
  return (
    ordered.find((e) =>
      dir === 1
        ? missionEventStepMs(e) > simMs + SAME_INSTANT_MS
        : missionEventStepMs(e) < simMs - SAME_INSTANT_MS,
    )?.id ?? null
  );
}
