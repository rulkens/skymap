/**
 * gaussian — one Box-Muller sample (mean 0, stddev 1) per call, driven by a
 * caller-supplied `[0, 1)` source (e.g. `mulberry32`) rather than a global,
 * so callers stay seed-deterministic. `u1` is floor-clamped to
 * `Number.MIN_VALUE` to avoid `Math.log(0)` — `rng()` can return exactly 0.
 *
 * Mirrors `tools/utils/random/gaussian.ts`; duplicated rather than shared
 * because `tools/` and `src/` don't import across that boundary.
 */
export function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), Number.MIN_VALUE);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
