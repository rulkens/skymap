/**
 * ismMapRingIndexForSample — nearest-texel ring lookup shared by
 * `sampleGalaxyIsmMap` and `sampleIsmMapOrientation`: binary-searches
 * `ismMapRingRadius`'s monotonic ring->radius mapping for the largest ring
 * whose radius is <= the query, rather than restating its log-radial
 * formula — the two samplers must never disagree about which ring a radius
 * falls in. Distinct from `ismMapRingIndexForRadius` (closed-form nearest,
 * exact only for radii that came FROM `ismMapRingRadius` itself): this is a
 * floor bucket over an arbitrary radius, for texel selection, not exact
 * inversion — and because `hi` starts at `rings - 1` unvalidated, it can
 * never return `rings - 1` itself (see this file's test for the concrete
 * out-of-range case).
 */
import { ismMapRingRadius } from './ismMapRingRadius';

export function ismMapRingIndexForSample(
  radius: number,
  rings: number,
  rMin: number,
  rMax: number,
): number {
  const clamped = Math.min(Math.max(radius, rMin), rMax);
  let lo = 0;
  let hi = rings - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ismMapRingRadius(mid, rings, rMin, rMax) <= clamped) lo = mid;
    else hi = mid;
  }
  return lo;
}
