import { COUNT_BIN_COUNT } from '../data/countBinCount.constant';

/** Each count bar's height as a share of the tallest; all zero before the first sample. */
export function barFractions(counts: Uint32Array): number[] {
  const bars = Array.from({ length: COUNT_BIN_COUNT }, (_, i) => counts[i] ?? 0);
  const tallest = Math.max(...bars);
  return bars.map((count) => (tallest > 0 ? count / tallest : 0));
}
