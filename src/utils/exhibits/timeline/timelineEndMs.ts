import type { MissionTimeline } from '../../../@types/exhibits/MissionTimeline';

/** Where a timeline's axis, scrub and play stop: its authored end, or the wall clock now. */
export function timelineEndMs(timeline: MissionTimeline): number {
  return timeline.endIso === undefined ? Date.now() : Date.parse(timeline.endIso);
}
