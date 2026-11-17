/**
 * lineSchedule — split a beat's dwell into one contiguous slice per subtitle
 * line, each weighted by its length. Contiguity means exactly one line is
 * visible at a time with no gap, and the slices sum to the dwell so the last
 * line leaves as the beat advances.
 */

import { SUBTITLE_MIN_CHARS } from '../../data/animation/subtitleTiming';

export function lineSchedule(
  lines: readonly string[],
  dwellSec: number,
): readonly { readonly startSec: number; readonly endSec: number }[] {
  const weights = lines.map((l) => Math.max(l.length, SUBTITLE_MIN_CHARS));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return weights.map((w, i) => {
    const startSec = (acc / total) * dwellSec;
    acc += w;
    // The last slice ends at exactly dwellSec, not a float-rounded neighbour.
    const endSec = i === weights.length - 1 ? dwellSec : (acc / total) * dwellSec;
    return { startSec, endSec };
  });
}
