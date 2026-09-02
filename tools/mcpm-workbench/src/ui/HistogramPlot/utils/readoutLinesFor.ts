import { HISTOGRAM_BASE } from '../../../sim/createGridBuffers';
import { formatSignificant } from './formatSignificant';
import { MAX_BIN_INDEX } from './MAX_BIN_INDEX';
import { sampledTotal } from './sampledTotal';

/** The E / M / null% / log-base readout rows, shared by the DOM overlay (which
 * renders them with hover tips) and `draw()` (which measures them for layout). */
export function readoutLinesFor(
  counts: Uint32Array,
  meanLogTraceAtPoints: number,
): readonly string[] {
  const peak = counts[MAX_BIN_INDEX] ?? 0;
  const nullCount = counts[0] ?? 0;
  const total = sampledTotal(counts);
  const nullPct = total > 0 ? (100 * nullCount) / total : NaN;
  return [
    `E: ${formatSignificant(meanLogTraceAtPoints, 4)}`,
    `M: ${formatSignificant(peak / 1e5, 4)}`,
    total > 0 ? `null: ${formatSignificant(nullPct, 2)}%` : 'null: —',
    `(log ${HISTOGRAM_BASE})`,
  ];
}
