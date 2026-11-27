/**
 * traceHistogram — bin log(1+trace) over every voxel into `binCount`
 * equal-width bins spanning `[0, maxLogTrace]`. `maxLogTrace` is a caller-
 * supplied argument (not derived internally) so `compareTraceCubes` can
 * compute one shared range across both cubes being compared — TV distance
 * on two histograms only means something if they share bin edges.
 */
export function traceHistogram(
  values: Float64Array | Float32Array,
  binCount: number,
  maxLogTrace: number,
): Float64Array {
  const hist = new Float64Array(binCount);
  const binWidth = maxLogTrace > 0 ? maxLogTrace / binCount : 1;
  for (let i = 0; i < values.length; i++) {
    const logV = Math.log1p(Math.max(values[i]!, 0)); // trace is non-negative; clamp defensively
    let bin = Math.floor(logV / binWidth);
    if (bin < 0) bin = 0;
    if (bin >= binCount) bin = binCount - 1;
    hist[bin]! += 1;
  }
  return hist;
}
