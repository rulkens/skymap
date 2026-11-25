import type { ExhibitTimelineData } from '../../../@types/exhibits/timeline/ExhibitTimelineData';

/** Where a timeline's axis, scrub and play stop: its authored end, or the wall clock now. */
export function timelineEndMs(timeline: ExhibitTimelineData): number {
  return timeline.endIso === undefined ? Date.now() : Date.parse(timeline.endIso);
}
