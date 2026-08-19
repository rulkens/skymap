/**
 * meanLogTraceAtPoints — this project's convergence statistic (spec §9:
 * "the fork's kernel only bins"): mean of log1p(max(density, 0)) over
 * in-grid density samples, divided by `sampledCount` — the caller's own
 * in-grid counter (histogram.wesl's atomic, or dataPointHistogram.ts's own
 * count), never re-derived from the array here so the two stay
 * independently checkable. A negative entry is the shared out-of-grid
 * sentinel (histogram.wesl writes -1.0; a real density is never negative)
 * and is excluded from the sum. One home for the mean-log-trace fold that
 * `dataPointHistogram.ts` (CLI) and `histogramSlice.ts` (live UI) both
 * compose — see tests/tools/mcpm-workbench/sim/densitySample.parity.test.ts
 * for what pins the WGSL copy this can't share code with.
 */
export function meanLogTraceAtPoints(densities: Iterable<number>, sampledCount: number): number {
  let sum = 0;
  for (const density of densities) {
    if (density < 0) continue; // out-of-grid sentinel
    sum += Math.log1p(Math.max(density, 0));
  }
  return sampledCount > 0 ? sum / sampledCount : NaN;
}
