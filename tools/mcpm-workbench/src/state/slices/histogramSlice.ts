import type { HistogramSlice } from '../../../@types/HistogramSlice';
import { HISTOGRAM_BINS } from '../../sim/createGridBuffers';
import { meanLogTraceAtPoints } from '../../sim/meanLogTraceAtPoints';

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
 * The mean-log-trace fold itself lives in `meanLogTraceAtPoints` — the SAME
 * home `dataPointHistogram.ts`'s CLI statistic composes from (spec section
 * 9), so this and the CLI number are guaranteed to agree rather than kept
 * in sync by convention.
 */
export function recordHistogramSample(
  prev: HistogramSlice,
  counts: Uint32Array,
  sampledCount: number,
  densities: Float32Array,
  stepCount: number,
): HistogramSlice {
  const meanLogTraceAtPointsValue = meanLogTraceAtPoints(densities, sampledCount);
  const history = [
    ...prev.history,
    { stepCount, meanLogTraceAtPoints: meanLogTraceAtPointsValue },
  ].slice(-MAX_HISTORY);
  return { ...prev, counts, meanLogTraceAtPoints: meanLogTraceAtPointsValue, history };
}

export function setSampleRandomly(prev: HistogramSlice, sampleRandomly: boolean): HistogramSlice {
  return { ...prev, sampleRandomly };
}

/** Viewport calls this alongside `resetStepCount` — old history entries would
 * otherwise show larger step counts than the freshly zeroed HUD counter. */
export function resetHistogram(prev: HistogramSlice): HistogramSlice {
  return { ...defaultHistogramSlice, sampleRandomly: prev.sampleRandomly };
}
