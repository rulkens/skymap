/**
 * gaussian — one Box-Muller sample (mean 0, stddev 1) per call.
 *
 * Why discard the second sample Box-Muller produces "for free"?  The
 * per-galaxy duplicate count in `buildFilaments` is variable, so a
 * cached second sample would cross galaxy boundaries and tangle the
 * seeded determinism.  At ~3M points × ≤15 copies × 3 axes the wasted
 * call is negligible compared to file I/O and the Delaunay stage.
 *
 * `u1` is floor-clamped to `Number.MIN_VALUE` to avoid `Math.log(0)`;
 * `rng()` returns [0, 1) so the zero case is theoretically reachable.
 */
export function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), Number.MIN_VALUE);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
