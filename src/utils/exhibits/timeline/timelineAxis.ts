import type { TimelineAxis } from '../../../@types/exhibits/TimelineAxis';
import type { TimelineEra } from '../../../@types/exhibits/TimelineEra';

/** The axis from the first era's start to `endMs`, split at each later era's start. */
export function timelineAxis(eras: readonly TimelineEra[], endMs: number): TimelineAxis {
  return { boundsMs: [...eras.map((era) => Date.parse(era.fromIso)), endMs] };
}
