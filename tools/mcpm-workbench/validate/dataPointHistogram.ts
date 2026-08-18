import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * dataPointHistogram — same log(1+trace) binning as `traceHistogram`, but
 * sampled only at catalog point locations (nearest voxel, points outside
 * the grid skipped) rather than every voxel. Also returns the mean of
 * those samples — `meanLogTraceAtPoints`, this project's convergence
 * signal (spec §9: "the fork's kernel only bins"). `meanLogTrace` here is
 * `sum(log1p(max(v,0))) / sampled` — the GPU-side live plot's
 * `recordHistogramSample` (histogramSlice.ts) uses this SAME definition
 * (out-of-grid points excluded from both the sum and the divisor), so the
 * in-UI curve and this CLI statistic mean the same thing. That identity
 * requires `Math.floor` (below) on BOTH sides of the voxel-index comparison:
 * `histogram.wesl` floors its continuous voxel coordinate before the `i32`
 * cast for the same reason — plain truncation-toward-zero disagrees with
 * `Math.floor` on the open interval (-1, 0) per axis, which would misclassify
 * a one-voxel shell just outside the grid's low faces.
 */
export function dataPointHistogram(args: {
  readonly values: Float64Array | Float32Array;
  readonly dims: Vec3;
  readonly originMpc: Vec3;
  readonly voxelSizeMpc: Vec3;
  readonly pointsMpc: Float32Array; // interleaved xyz, Mpc
  readonly pointCount: number;
  readonly binCount: number;
  readonly maxLogTrace: number;
}): { histogram: Float64Array; meanLogTrace: number } {
  const { values, dims, originMpc, voxelSizeMpc, pointsMpc, pointCount, binCount, maxLogTrace } =
    args;
  const [nx, ny, nz] = dims;
  const histogram = new Float64Array(binCount);
  const binWidth = maxLogTrace > 0 ? maxLogTrace / binCount : 1;
  let sum = 0;
  let sampled = 0;
  for (let i = 0; i < pointCount; i++) {
    const xi = Math.floor((pointsMpc[i * 3]! - originMpc[0]) / voxelSizeMpc[0]);
    const yi = Math.floor((pointsMpc[i * 3 + 1]! - originMpc[1]) / voxelSizeMpc[1]);
    const zi = Math.floor((pointsMpc[i * 3 + 2]! - originMpc[2]) / voxelSizeMpc[2]);
    if (xi < 0 || xi >= nx || yi < 0 || yi >= ny || zi < 0 || zi >= nz) continue;
    const logV = Math.log1p(Math.max(values[zi * ny * nx + yi * nx + xi]!, 0));
    let bin = Math.floor(logV / binWidth);
    if (bin < 0) bin = 0;
    if (bin >= binCount) bin = binCount - 1;
    histogram[bin]! += 1;
    sum += logV;
    sampled++;
  }
  return { histogram, meanLogTrace: sampled > 0 ? sum / sampled : NaN };
}
