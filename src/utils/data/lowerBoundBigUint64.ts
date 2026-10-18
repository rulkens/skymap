/** The first index whose value is ≥ `key` in an ascending `sorted`; `sorted.length` if none. */
export function lowerBoundBigUint64(sorted: BigUint64Array, key: bigint): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
