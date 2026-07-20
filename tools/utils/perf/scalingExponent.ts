/**
 * scalingExponent — the log-log least-squares slope of GPU time vs pixel count,
 * i.e. the exponent `n` in the fit `time ≈ k · pixelsⁿ`.
 *
 * ### Why a slope, and why in log space
 *
 * WebGPU exposes no fragment- or vertex-invocation counters, so we cannot ask
 * the driver "was this pass fill-bound?" directly. What we CAN do is vary the
 * one input a fill-bound pass is sensitive to — the pixel count — and watch how
 * its time responds. A pass whose cost is dominated by fragment shading scales
 * ~linearly with pixels (`n ≈ 1`); a pass whose cost is fixed geometry / CPU
 * submission is resolution-independent (`n ≈ 0`). A power law `y = k·xⁿ` is a
 * straight LINE of slope `n` once both axes are logged (`ln y = ln k + n·ln x`),
 * so an ordinary least-squares slope of `ln(y)` against `ln(x)` recovers `n`.
 * "Vertex/CPU-bound" is only ever inferred here by ELIMINATION — a low exponent
 * means "not fill-bound", not a positive vertex measurement.
 *
 * ### The filter and the two-point floor
 *
 * `ln` is undefined at 0, so a pass that read exactly 0.0 ms at the smallest
 * scale (below the timer's resolution) contributes no usable point. We drop
 * every point without `x > 0 && y > 0` first; if fewer than two survive there is
 * no line to fit and we return `NaN` (a single point defines infinitely many
 * slopes). Callers map that `NaN` to the `'n/a'` label via `classifyBound`.
 */

export function scalingExponent(points: readonly { x: number; y: number }[]): number {
  const usable = points.filter((p) => p.x > 0 && p.y > 0);
  if (usable.length < 2) return NaN;

  const lxs = usable.map((p) => Math.log(p.x));
  const lys = usable.map((p) => Math.log(p.y));
  const lxMean = lxs.reduce((a, b) => a + b, 0) / lxs.length;
  const lyMean = lys.reduce((a, b) => a + b, 0) / lys.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < usable.length; i++) {
    const dx = lxs[i]! - lxMean;
    numerator += dx * (lys[i]! - lyMean);
    denominator += dx * dx;
  }
  // All x equal (denominator 0) has no defined slope; NaN falls out of 0/0.
  return numerator / denominator;
}
