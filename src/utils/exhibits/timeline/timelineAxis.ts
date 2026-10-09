import type { MissionStop } from '../../../@types/missions/MissionStop';
import type { TimelineAxis } from '../../../@types/exhibits/TimelineAxis';

/** One equal-width segment per mission leg: stop to stop, the last stop to `endMs`. */
export function timelineAxis(stops: readonly MissionStop[], endMs: number): TimelineAxis {
  return { boundsMs: [...stops.map((stop) => stop.ms), endMs] };
}
