/** One throttled histogram readback, plotted as a point on the convergence curve. */
export type HistogramSample = {
  readonly stepCount: number;
  readonly meanLogTraceAtPoints: number;
};

/**
 * HistogramSlice — the live density-histogram readout (task-T20): the
 * fork's 17-bin counts from the last throttled sample (index 0 = null bin,
 * 1-15 = log-density bins, 16 = running max marker — constants.wesl's
 * N_HISTOGRAM_BINS) plus a capped `meanLogTraceAtPoints` time series, this
 * project's convergence signal (spec section 9). `counts` and the newest
 * `history` entry always describe the SAME readback, never a blend of two.
 */
export type HistogramSlice = {
  readonly counts: Uint32Array;
  readonly meanLogTraceAtPoints: number;
  readonly history: readonly HistogramSample[];
  /** Mirrors histogram.wesl's `sampleRandomly` uniform field (fork's jittered-position mode). */
  readonly sampleRandomly: boolean;
};
