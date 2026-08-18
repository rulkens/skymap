import type { HistogramSlice } from '../../../@types/HistogramSlice';
import { HISTOGRAM_BINS } from '../../sim/createGridBuffers';

// Caps the convergence plot's x-axis span rather than growing it unbounded over a
// long-running sim — HistogramPlot draws the tail, not the whole run.
const MAX_HISTORY = 200;

export const defaultHistogramSlice: HistogramSlice = {
  counts: new Uint32Array(HISTOGRAM_BINS),
  meanLogTraceAtPoints: NaN,
  history: [],
  sampleRandomly: false,
};

/**
 * recordHistogramSample — installs one throttled `readHistogram()` result.
 * `meanLogTraceAtPoints` is `mean(log1p(max(density, 0)))` over the IN-GRID
 * densities only, divided by `sampledCount` (histogram.wesl's own in-grid
 * counter) — the SAME definition `dataPointHistogram.ts`'s CLI statistic
 * uses (spec section 9): points outside the grid box are excluded from both
 * the sum and the divisor there, and `-1` here is `histogram.wesl`'s sentinel
 * for that same exclusion (a real density is never negative). Kept in sync
 * by convention rather than shared code: that function bundles voxel-lookup
 * + binning + the mean into one pass over a full readback cube, so there is
 * no separable "just the mean" call to share — see task-T20-report.md.
 */
export function recordHistogramSample(
  prev: HistogramSlice,
  counts: Uint32Array,
  sampledCount: number,
  densities: Float32Array,
  stepCount: number,
): HistogramSlice {
  let sum = 0;
  for (let i = 0; i < densities.length; i++) {
    const density = densities[i]!;
    if (density < 0) continue; // histogram.wesl's out-of-grid sentinel
    sum += Math.log1p(Math.max(density, 0));
  }
  const meanLogTraceAtPoints = sampledCount > 0 ? sum / sampledCount : NaN;
  const history = [...prev.history, { stepCount, meanLogTraceAtPoints }].slice(-MAX_HISTORY);
  return { ...prev, counts, meanLogTraceAtPoints, history };
}

export function setSampleRandomly(prev: HistogramSlice, sampleRandomly: boolean): HistogramSlice {
  return { ...prev, sampleRandomly };
}

/** Viewport calls this alongside `resetStepCount` — old history entries would
 * otherwise show larger step counts than the freshly zeroed HUD counter. */
export function resetHistogram(prev: HistogramSlice): HistogramSlice {
  return { ...defaultHistogramSlice, sampleRandomly: prev.sampleRandomly };
}
