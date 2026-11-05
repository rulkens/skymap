/** The first index in `[0, n)` where `before(i)` is false, `n` if none; `before` must be true then false. */
export function lowerBound(n: number, before: (i: number) => boolean): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
