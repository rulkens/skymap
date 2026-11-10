/**
 * The window the timeline draws: the viewport, or when it is null (Fit) the whole clip plus a margin
 * so the End flag and the `after end` zone have room. An unresolved clip falls back to the last row end.
 */
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import type { Timeline } from '../../../@types/rows/Timeline';

const FIT_MARGIN = 1.2;
const MIN_SPAN_SEC = 1;

export function viewWindow(viewport: TimeWindow | null, timeline: Timeline): TimeWindow {
  if (viewport !== null) return viewport;
  const end = timeline.durationSec ?? Math.max(0, ...timeline.rows.map((row) => row.endSec ?? 0));
  return { startSec: 0, endSec: Math.max(MIN_SPAN_SEC, end * FIT_MARGIN) };
}
