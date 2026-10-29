/**
 * createSimRateTracker — the clock rate the dots' fade reads: sweeps cannot keep up past ~2 h/s,
 * and a rate is steady where a sweep's age is not.
 */
import type { SimRateTracker } from '../@types/SimRateTracker';

export function createSimRateTracker(): SimRateTracker {
  let last: { simMs: number; nowMs: number } | null = null;
  let rate = 0;
  return {
    observe(simMs, nowMs) {
      if (last !== null && nowMs === last.nowMs) return;
      rate = last === null ? 0 : Math.abs(simMs - last.simMs) / (nowMs - last.nowMs);
      last = { simMs, nowMs };
    },
    rate: () => rate,
  };
}
