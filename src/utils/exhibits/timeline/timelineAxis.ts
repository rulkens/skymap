import type { TimelineAxis } from '../../../@types/exhibits/TimelineAxis';
import type { TimelineEra } from '../../../@types/exhibits/TimelineEra';

/** The axis from `fromIso` to `endMs`, split at each later era's start; no eras = one span. */
export function timelineAxis(
  fromIso: string,
  eras: readonly TimelineEra[] | undefined,
  endMs: number,
): TimelineAxis {
  const starts = (eras ?? []).slice(1).map((era) => Date.parse(era.fromIso));
  return { boundsMs: [Date.parse(fromIso), ...starts, endMs] };
}
