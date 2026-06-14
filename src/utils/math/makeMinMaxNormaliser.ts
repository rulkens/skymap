/**
 * makeMinMaxNormaliser — build a function that min-max normalises a raw value
 * into [0, 1] over a known sample set.
 *
 * `transform` is applied to every sample (and to each input at call time)
 * before the min-max, so a caller can normalise in log space — pass
 * `Math.log10` for a quantity that spans orders of magnitude, or the identity
 * for a linear one. The min/max are walked by hand (not `Math.min(...)`) so a
 * large sample array can't trip the call-argument limit.
 *
 * Degenerate sets map to full weight rather than dividing by zero:
 *   - an empty sample set returns a constant `() => 1`;
 *   - a set whose transformed max equals its min (one sample, or all-equal)
 *     also returns `() => 1`.
 */
export function makeMinMaxNormaliser(
  rawValues: readonly number[],
  transform: (raw: number) => number,
): (raw: number) => number {
  if (rawValues.length === 0) return () => 1;
  const transformed = rawValues.map(transform);
  let min = transformed[0]!;
  let max = transformed[0]!;
  for (const v of transformed) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Single sample or all-equal: full weight, no divide-by-zero.
  if (max === min) return () => 1;
  const span = max - min;
  return (raw: number) => (transform(raw) - min) / span;
}
