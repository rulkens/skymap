import type { TimelineStop } from '../../../@types/camera/timeline/TimelineStop';
import type { TimelineAxis } from '../../../@types/exhibits/timeline/TimelineAxis';

/** One equal-width segment per leg: stop to stop, the last stop to `endMs`. */
export function timelineAxis(stops: readonly TimelineStop[], endMs: number): TimelineAxis {
  return { boundsMs: [...stops.map((stop) => stop.ms), endMs] };
}
