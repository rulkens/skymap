import type { ClipSpan } from '../../../../../src/@types/animation/ClipSpan';
import type { Timeline } from '../../@types/rows/Timeline';
import type { TimelineRow } from '../../@types/rows/TimelineRow';

/**
 * What Loop loops (Q16): the selected row's visible extent, or the whole clip with nothing
 * selected or a row of no length. Null while the clip is unresolved.
 */
export function loopSpanOf(row: TimelineRow | null, timeline: Timeline): ClipSpan | null {
  if (timeline.durationSec === null) return null;
  const whole = { startSec: 0, endSec: timeline.durationSec };
  if (row === null || row.startSec === null || row.endSec === null) return whole;
  const endSec = Math.max(row.endSec, row.tailEndSec ?? row.endSec);
  return endSec > row.startSec ? { startSec: row.startSec, endSec } : whole;
}
