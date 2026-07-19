/**
 * estimateFloor — approximate the fixed per-pass overhead ("floor") that every
 * render pass in a group pays, from the gap between running the group's passes
 * merged vs. one-layer-at-a-time.
 *
 * WHY `(ΣLᵢ − G)/n`: each pass carries a fixed cost independent of its useful
 * work — the load/store round-trip of binding, reading the framebuffer in, and
 * writing it back out. A MERGED pass over the whole group (median `G`) pays
 * that round-trip ONCE. The per-layer run (medians `Lᵢ`) pays it `n` times, so
 * its total `ΣLᵢ` exceeds the merged `G` by roughly the `(n−1)` extra
 * round-trips: `ΣLᵢ − G ≈ (n−1)·floor`. We divide the excess by `n` (not
 * `n−1`) as a deliberately conservative per-pass estimate — one extra unit of
 * denominator keeps the reported floor from over-claiming on noisy timings.
 *
 * Two guards:
 *  - `max(0, …)`: measurement noise (or a genuinely round-trip-free group) can
 *    make `G ≥ ΣLᵢ`, giving a negative estimate. A negative floor is
 *    nonsensical, so we clamp to 0.
 *  - `n < 2` → 0: with a single layer there is no merged-vs-split comparison to
 *    make (the "group" is the layer), so there is no floor to separate out and
 *    the report omits its floor line.
 */
export function estimateFloor(
  layerMedians: readonly number[],
  mergedGroupMedian: number,
): number {
  const n = layerMedians.length;
  if (n < 2) return 0;

  const sum = layerMedians.reduce((acc, m) => acc + m, 0);
  return Math.max(0, (sum - mergedGroupMedian) / n);
}
