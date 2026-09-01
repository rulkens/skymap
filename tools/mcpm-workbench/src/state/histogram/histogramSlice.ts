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
    /** T20: jittered-position samples and data-point samples are differently-defined
     * statistics under the same `meanLogTraceAtPoints` name — every toggle edge resets
     * the rest of the slice so the two never ride the same convergence curve. */
    setSampleRandomly: (state, action: PayloadAction<boolean>) => {
      Object.assign(state, defaultHistogramSlice);
      state.sampleRandomly = action.payload;
    },
    /** Called alongside `resetStepCount` (watchSceneSaga, watchSimCommandsSaga) — old
     * history entries would otherwise show larger step counts than the freshly zeroed
     * HUD counter. */
    resetHistogram: (state) => {
      const { sampleRandomly } = state;
      Object.assign(state, defaultHistogramSlice);
      state.sampleRandomly = sampleRandomly;
    },
  },
});

export const { recordHistogramSample, setSampleRandomly, resetHistogram } = histogramSlice.actions;
