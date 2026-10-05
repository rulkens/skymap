import type { TimelineAxis } from '../../../@types/exhibits/TimelineAxis';

import type { TimelineAxisLabel } from '../../../@types/exhibits/TimelineAxisLabel';

const YEAR_MS = 365.25 * 86_400_000;
const MIN_GAP = 0.13;

/**
 * Year labels along the axis: each segment's start year, then the 5- or 10-year marks inside
 * it, and 'now' at the end. A mark closer than `MIN_GAP` of the track to the last kept one is
 * dropped, so 9 px mono labels never touch.
 */
export function timelineAxisLabels(axis: TimelineAxis): readonly TimelineAxisLabel[] {
  const { boundsMs } = axis;
  const segments = boundsMs.length - 1;
  const labels: TimelineAxisLabel[] = [];
  const push = (fraction: number, text: string) => {
    const last = labels.at(-1);
    if (!last || fraction - last.fraction >= MIN_GAP) labels.push({ fraction, text });
  };
  for (let i = 0; i < segments; i++) {
    const from = boundsMs[i]!;
    const to = boundsMs[i + 1]!;
    const step = (to - from) / YEAR_MS > 20 ? 10 : 5;
    push(i / segments, String(new Date(from).getUTCFullYear()));
    for (
      let year = Math.floor(new Date(from).getUTCFullYear() / step + 1) * step;
      Date.UTC(year, 0, 1) < to;
      year += step
    ) {
      const ms = Date.UTC(year, 0, 1);
      if (ms > from) push((i + (ms - from) / (to - from)) / segments, String(year));
    }
  }
  const last = labels.at(-1);
  if (last && 1 - last.fraction < MIN_GAP) labels.pop();
  labels.push({ fraction: 1, text: 'now' });
  return labels;
}
