/**
 * percentile — the value at percentile `p` (0–100) of a set of numbers, using
 * the "type-7" linear-interpolation definition (the default in R, NumPy and
 * most stats packages).
 *
 * WHY type-7 rather than "nearest rank": the harness aggregates GPU frame
 * timings, where the distribution is continuous and small (often a few dozen
 * frames). Nearest-rank snaps to an actual sample and jumps discontinuously as
 * one more frame arrives; type-7 interpolates between the two bracketing
 * samples, so a p95 over 30 frames reads as a smooth blend rather than "the
 * 29th sample, exactly". The rank position is `r = (p/100)*(n-1)` — note the
 * `n-1`: p=0 maps to index 0 and p=100 maps to index n-1, both endpoints
 * inclusive.
 *
 * This is NOT the inverse of `tools/utils/math/percentileOf.ts` (which maps a
 * value → its rank); this maps a rank → its value.
 *
 * Guard: when `frac === 0` the result is exactly `values[lo]`, so we return it
 * WITHOUT touching `values[lo+1]`. That matters at the top of the range — a
 * single-element array (`percentile([5], 50)`: r=0, lo=0) and any `p=100`
 * (lo=n-1) both put `lo` on the last index, where `values[lo+1]` is
 * `undefined` and the naive `frac*(undefined - x)` would be `0*NaN = NaN`. The
 * harness calls `median` on frames=1 buckets, so the single-element path is
 * exercised for real.
 */
export function percentile(values: readonly number[], p: number): number {
  const n = values.length;
  if (n === 0) {
    throw new Error('percentile: cannot take a percentile of an empty array');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const r = (p / 100) * (n - 1);
  const lo = Math.floor(r);
  const frac = r - lo;

  // frac === 0 covers both an exact hit on a sample and lo === n-1 (p=100 or a
  // single element) — return the endpoint without reading past the array.
  if (frac === 0) return sorted[lo]!;

  return sorted[lo]! + frac * (sorted[lo + 1]! - sorted[lo]!);
}
