/**
 * One compact line for a failed compile: `Distance · 2 writers · 4–10 s`. The names and the time
 * range come from the culprit rows (the ones the model marked with an error), the reason from the
 * compiler; a culprit the spans never reached has no time and adds none.
 */
import { COMPILE_REASON_TEXT } from '../data/compileReasonText';
import { formatNameList } from '../../utils/format/formatNameList';
import { formatNumber } from '../../utils/format/formatNumber';
import type { ClipCompileErrorInfo } from '../../@types/rows/ClipCompileErrorInfo';
import type { TimelineRow } from '../../@types/rows/TimelineRow';

export function compileErrorLine(
  error: ClipCompileErrorInfo,
  rows: readonly TimelineRow[],
): string {
  const culprits = rows.filter((row) => row.errors.length > 0);
  const names = [...new Set(culprits.map((row) => row.label.name))];
  const starts = culprits.flatMap((row) => (row.startSec === null ? [] : [row.startSec]));
  const ends = culprits.flatMap((row) => (row.endSec === null ? [] : [row.endSec]));
  const range =
    starts.length === 0 || ends.length === 0
      ? null
      : `${formatNumber(Math.min(...starts))}–${formatNumber(Math.max(...ends))} s`;
  return [names.length > 0 ? formatNameList(names) : null, COMPILE_REASON_TEXT[error.reason], range]
    .filter((part) => part !== null)
    .join(' · ');
}
