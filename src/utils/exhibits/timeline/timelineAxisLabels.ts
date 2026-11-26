import type { TimelineAxis } from '../../../@types/exhibits/timeline/TimelineAxis';

import type { TimelineAxisLabel } from '../../../@types/exhibits/timeline/TimelineAxisLabel';
import { YEAR_MS } from '../../../data/time/yearMs';

const MIN_GAP = 0.13;

/** Under this span every label would read the same year or two, so they carry the month. */
const SHORT_SPAN_YEARS = 2;

/**
 * Year labels along the axis: each segment's start year, then the 5- or 10-year marks inside
 * it, and at the end the authored `endIso`'s year, or 'now' for an open end. A mark closer than
 * `MIN_GAP` of the track to the last kept one is dropped, so 9 px mono labels never touch.
 * A short axis writes month and year ('Aug 2026') instead.
 */
export function timelineAxisLabels(
  axis: TimelineAxis,
  endIso: string | undefined,
): readonly TimelineAxisLabel[] {
  const { boundsMs } = axis;
  const segments = boundsMs.length - 1;
  const labels: TimelineAxisLabel[] = [];
  const push = (fraction: number, text: string) => {
    const last = labels.at(-1);
    if (!last || fraction - last.fraction >= MIN_GAP) labels.push({ fraction, text });
  };
  const short = boundsMs.at(-1)! - boundsMs[0]! < SHORT_SPAN_YEARS * YEAR_MS;
  const text = (ms: number) =>
    short
      ? new Date(ms).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : String(new Date(ms).getUTCFullYear());
  for (let i = 0; i < segments; i++) {
    const from = boundsMs[i]!;
    const to = boundsMs[i + 1]!;
    const step = (to - from) / YEAR_MS > 20 ? 10 : 5;
    push(i / segments, text(from));
    for (
      let year = Math.floor(new Date(from).getUTCFullYear() / step + 1) * step;
      Date.UTC(year, 0, 1) < to;
      year += step
    ) {
      const ms = Date.UTC(year, 0, 1);
      if (ms > from) push((i + (ms - from) / (to - from)) / segments, text(ms));
    }
  }
  const last = labels.at(-1);
  if (last && 1 - last.fraction < MIN_GAP) labels.pop();
  const end = endIso === undefined ? 'now' : text(Date.parse(endIso));
  labels.push({ fraction: 1, text: end });
  return labels;
}
