/**
 * HistogramReadback — one throttled sample of the histogram pass: the fork's
 * 17-bin counts (index 0 = null bin, 1-15 = log-density bins, 16 = running
 * max marker — constants.wesl's N_HISTOGRAM_BINS) plus each catalog point's
 * own trace density, in agent-index order. `densities` is the SAME
 * per-data-point sample the counts are binned from — the host derives
 * `meanLogTraceAtPoints` from it (spec section 9: "the fork's kernel only bins").
 */
export type HistogramReadback = {
  readonly counts: Uint32Array;
  readonly densities: Float32Array;
};
