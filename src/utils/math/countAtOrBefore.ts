/**
 * countAtOrBefore — how many entries of an ascending column are `<= x` (binary search).
 * `count - 1` is the bracketing interval's lower index; the `<=` tie rule is load-bearing:
 * the mission trail's head count and the Hermite interval must agree at a sample.
 */

export function countAtOrBefore(sorted: Float64Array, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
