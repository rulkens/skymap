/**
 * The brightness of a picture as displayed: mean, 5th and 95th percentile of its pixels' luma
 * (gamma-encoded grey, 0 black to 1 white). A render of space is mostly black, so `p95`, the
 * brightness of its subject, says more than the mean.
 */
export type LumaStats = {
  mean: number;
  p5: number;
  p95: number;
};
