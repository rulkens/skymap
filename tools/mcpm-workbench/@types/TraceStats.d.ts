/**
 * TraceStats — summary statistics `compareTraceCubes` computes for one side
 * (workbench-produced or fork-produced) of a trace-cube comparison. Both
 * histograms share fixed bin edges across the two sides being compared, so
 * `totalVariation` on the raw pair is meaningful without re-normalising.
 *
 * Contract: docs/superpowers/specs/2026-08-18-mcpm-workbench-design.md §9.
 */
export type TraceStats = {
  /** Fixed edges over log(1+trace), every voxel in the cube. */
  readonly logHistogram: Float64Array;
  /** Same binning, sampled at catalog data-point locations only — the fork's N_HISTOGRAM_BINS shape (default 17). */
  readonly dataPointHistogram: Float64Array;
  /** Per-axis (x, y, z) sums over the other two axes. */
  readonly marginals: readonly [Float64Array, Float64Array, Float64Array];
  /** Mean of log(1+trace) sampled at data-point locations; NaN when no points were supplied. */
  readonly meanLogTraceAtPoints: number;
};
