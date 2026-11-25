import type { TimelineEvent } from '../../../@types/exhibits/timeline/TimelineEvent';
import { TIMELINE_FLYBY_LEAD_DAYS } from '../../../data/exhibits/timeline/timelineFlybyLeadDays';
import { DAY_MS } from '../../../data/time/dayMs';
import { timelineEventMs } from './timelineEventMs';

/**
 * Where a step to `event` lands the clock: a flyby's lead-in before closest approach, any other
 * event's own instant. The card and the step order read events at this instant too, so a flyby
 * is current from the moment a step lands on it.
 */
export function timelineEventStepMs(event: TimelineEvent): number {
  const lead = event.kind === 'flyby' ? TIMELINE_FLYBY_LEAD_DAYS * DAY_MS : 0;
  return timelineEventMs(event) - lead;
}
