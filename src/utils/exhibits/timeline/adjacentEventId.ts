import { timelineEventStepMs } from './timelineEventStepMs';
import { SAME_INSTANT_MS } from '../../../data/exhibits/timeline/sameInstantMs';
import type { TimelineEvent } from '../../../@types/exhibits/timeline/TimelineEvent';

/**
 * The id of the nearest event whose step instant lies strictly before (-1) or after (+1)
 * `simMs`; null at either end. Step instants, so a step to a flyby's lead-in counts as at it.
 */
export function adjacentEventId(
  events: readonly TimelineEvent[],
  simMs: number,
  dir: -1 | 1,
): string | null {
  const ordered = dir === 1 ? events : [...events].reverse();
  return (
    ordered.find((e) =>
      dir === 1
        ? timelineEventStepMs(e) > simMs + SAME_INSTANT_MS
        : timelineEventStepMs(e) < simMs - SAME_INSTANT_MS,
    )?.id ?? null
  );
}
