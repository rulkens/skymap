/**
 * selectKth — the k-th smallest value (0-based), as `values.sort()[k]` reads
 * it, in O(n) on average instead of O(n log n). Reorders `values` in place so
 * everything before index k is <= it and everything after is >=, with NaN last
 * as a typed sort puts it. Hoare partitioning around a median of three, which
 * stays linear on sorted input and on long runs of one value (a flat z column).
 */
export function selectKth(values: Float64Array, k: number): number {
  let hi = values.length - 1;
  for (let i = hi; i >= 0; i--) {
    if (values[i] !== values[i]) {
      values[i] = values[hi]!;
      values[hi--] = NaN;
    }
  }
  if (k > hi) return NaN;

  let lo = 0;
  while (hi > lo) {
    const mid = (lo + hi) >>> 1;
    const a = values[lo]!;
    const b = values[mid]!;
    const c = values[hi]!;
    const pivot = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (values[i]! < pivot) i++;
      while (values[j]! > pivot) j--;
      if (i <= j) {
        const swap = values[i]!;
        values[i++] = values[j]!;
        values[j--] = swap;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return values[k]!;
}
