import { timelineEventStepMs } from './timelineEventStepMs';
import { SAME_INSTANT_MS } from '../../../data/exhibits/timeline/sameInstantMs';
import type { TimelineEvent } from '../../../@types/exhibits/timeline/TimelineEvent';

/** The last event whose step instant is at or before `ms`, give or take a clock round-trip (events sorted), or null. */
export function currentTimelineEvent(
  events: readonly TimelineEvent[],
  ms: number,
): TimelineEvent | null {
  let current: TimelineEvent | null = null;
  for (const event of events) {
    if (timelineEventStepMs(event) > ms + SAME_INSTANT_MS) break;
    current = event;
  }
  return current;
}
