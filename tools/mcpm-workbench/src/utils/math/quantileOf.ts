import { selectKth } from './selectKth';

/**
 * quantileOf — the type-7 quantile (R and NumPy's default, linear between the
 * two nearest ranks) of `values`, as read off the sorted array, in O(n).
 * Reorders `values` in place.
 */
export function quantileOf(values: Float64Array, q: number): number {
  const n = values.length;
  if (n === 0) throw new Error('quantileOf: no values');
  const r = q * (n - 1);
  const lo = Math.floor(r);
  const frac = r - lo;
  const low = selectKth(values, lo);
  if (frac === 0) return low;
  // Everything after index lo is now >= `low`, NaN last: the next rank is their least.
  let high = NaN;
  for (let i = lo + 1; i < n; i++) {
    const v = values[i]!;
    if (!(v >= high) && v === v) high = v;
  }
  return low + frac * (high - low);
}
