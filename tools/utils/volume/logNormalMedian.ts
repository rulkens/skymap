/**
 * logNormalMedian — closed-form median of a log-normal field from its
 * posterior mean and std, `mean / sqrt(1 + (std/mean)^2)`. The Edenhofer
 * dust map ships mean+std per voxel; the log-normal mean is always
 * brighter than any real realization (it integrates the whole right
 * tail), so `buildDustVolume` de-biases with the median before packing.
 * `mean === 0` defines the median as `0` rather than evaluating the 0/0.
 */
export function logNormalMedian(mean: number, std: number): number {
  if (mean === 0) return 0;
  return mean / Math.sqrt(1 + (std / mean) ** 2);
}
