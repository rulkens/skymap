import type { MeanStdDev } from '../../@types/MeanStdDev';

/**
 * meanStdDev — one pass, no allocation. Welford's update, because the textbook
 * Σx² − n·mean² cancels to noise when the spread is small beside the values
 * (weights near 1e12 with a spread of 1e5). Population form, so one value has 0.
 */
export function meanStdDev(values: Float32Array): MeanStdDev {
  let mean = 0;
  let squares = 0; // sum of squared distances from the running mean
  for (let i = 0; i < values.length; i++) {
    const x = values[i]!;
    const delta = x - mean;
    mean += delta / (i + 1);
    squares += delta * (x - mean);
  }
  return { mean, stdDev: Math.sqrt(squares / values.length) };
}
