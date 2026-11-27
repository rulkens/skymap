// The `histogram` buffer holds one MORE element than HISTOGRAM_BINS: index HISTOGRAM_BINS is
// this project's own in-grid sampled-point counter (histogram.wesl), not one of the fork's bins.
export const HISTOGRAM_BINS = 17; // constants.wesl N_HISTOGRAM_BINS: 16 counts + running max
