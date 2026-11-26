import type { TimelineEvent } from '../../../@types/exhibits/timeline/TimelineEvent';

export function timelineEventMs(event: TimelineEvent): number {
  return Date.parse(event.iso);
}
