/** One throttled histogram readback, plotted as a point on the convergence curve. */
export type HistogramSample = {
  readonly stepCount: number;
  readonly meanLogTraceAtPoints: number;
};
