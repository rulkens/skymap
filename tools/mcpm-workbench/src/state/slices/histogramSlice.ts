import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
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

export const histogramSlice = createSlice({
  name: 'histogram',
  initialState: defaultHistogramSlice,
  reducers: {
    /**
     * recordHistogramSample — installs one throttled `readHistogram()` result.
     * The mean-log-trace fold itself lives in `meanLogTraceAtPoints` — the SAME
     * home `dataPointHistogram.ts`'s CLI statistic composes from (spec section
     * 9), so this and the CLI number are guaranteed to agree rather than kept
     * in sync by convention.
     */
    recordHistogramSample: (
      state,
      action: PayloadAction<{
        counts: Uint32Array;
        sampledCount: number;
        densities: Float32Array;
        stepCount: number;
      }>,
    ) => {
      const { counts, sampledCount, densities, stepCount } = action.payload;
      const meanLogTraceAtPointsValue = meanLogTraceAtPoints(densities, sampledCount);
      state.counts = counts;
      state.meanLogTraceAtPoints = meanLogTraceAtPointsValue;
      state.history = [
        ...state.history,
        { stepCount, meanLogTraceAtPoints: meanLogTraceAtPointsValue },
      ].slice(-MAX_HISTORY);
    },
    setSampleRandomly: (state, action: PayloadAction<boolean>) => {
      state.sampleRandomly = action.payload;
    },
    /** Viewport calls this alongside `resetStepCount` — old history entries would
     * otherwise show larger step counts than the freshly zeroed HUD counter. */
    resetHistogram: (state) => {
      const { sampleRandomly } = state;
      Object.assign(state, defaultHistogramSlice);
      state.sampleRandomly = sampleRandomly;
    },
  },
});

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function recordHistogramSample(
  prev: HistogramSlice,
  counts: Uint32Array,
  sampledCount: number,
  densities: Float32Array,
  stepCount: number,
): HistogramSlice {
  return histogramSlice.reducer(
    prev,
    histogramSlice.actions.recordHistogramSample({ counts, sampledCount, densities, stepCount }),
  );
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function setSampleRandomly(prev: HistogramSlice, sampleRandomly: boolean): HistogramSlice {
  return histogramSlice.reducer(prev, histogramSlice.actions.setSampleRandomly(sampleRandomly));
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function resetHistogram(prev: HistogramSlice): HistogramSlice {
  return histogramSlice.reducer(prev, histogramSlice.actions.resetHistogram());
}
