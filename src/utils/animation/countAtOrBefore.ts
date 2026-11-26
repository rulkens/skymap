/** How many of `items` (ascending atSec) apply at t: atSec ≤ t, so a step at exactly t applies. */
export function countAtOrBefore(items: readonly { readonly atSec: number }[], t: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.atSec <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
