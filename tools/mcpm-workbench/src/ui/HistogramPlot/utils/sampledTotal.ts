import { COUNT_BIN_COUNT } from './COUNT_BIN_COUNT';

/**
 * Sum of the 16 real count bins — every in-grid sampled point increments
 * exactly one of them (histogram.wesl's `histoIndex` is always 0..15), so
 * this sum IS the sampled total the fork calls `norm_coef` (main.cpp:1622)
 * without a second buffer element: `HistogramReadback.sampledCount` already
 * carries the same number, but `recordHistogramSample` doesn't thread it
 * into `HistogramSlice` (it's consumed there, not stored) — re-deriving it
 * from `counts` avoids growing the slice for a value already implicit in it.
 */
export function sampledTotal(counts: Uint32Array): number {
  let total = 0;
  for (let i = 0; i < COUNT_BIN_COUNT; i++) total += counts[i] ?? 0;
  return total;
}
