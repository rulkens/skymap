/**
 * meanLogTraceAtPoints — mean of log1p(max(density, 0)) over in-grid
 * samples, divided by the caller's own `sampledCount` (never re-derived
 * here, so the two stay independently checkable). Negative entries are the
 * shared out-of-grid sentinel (histogram.wesl writes -1.0). One home for the
 * fold `dataPointHistogram.ts` and `histogramSlice.ts` both compose — WGSL
 * copy pinned by densitySample.parity.test.ts.
 */
export function meanLogTraceAtPoints(densities: Iterable<number>, sampledCount: number): number {
  let sum = 0;
  for (const density of densities) {
    if (density < 0) continue;
    sum += Math.log1p(Math.max(density, 0));
  }
  return sampledCount > 0 ? sum / sampledCount : NaN;
}
