/** Plain (unweighted) mean of a numeric array; 0 for an empty one rather than NaN. */
export function arrayMean(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i]!;
  return sum / n;
}
