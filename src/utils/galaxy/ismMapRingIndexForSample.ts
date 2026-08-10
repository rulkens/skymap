/**
 * ismMapRingIndexForSample — nearest-texel ring lookup shared by
 * `sampleGalaxyIsmMap` and `sampleIsmMapOrientation`: binary-searches
 * `ismMapRingRadius`'s monotonic ring->radius mapping for the floor ring at
 * an arbitrary radius, so the two samplers can't disagree about which ring
 * it falls in. Unlike `ismMapRingIndexForRadius` (closed-form, exact only
 * for radii that came FROM `ismMapRingRadius` itself), `hi` starts
 * unclamped at `rings - 1`, so this can never return that index (see the
 * test for the concrete out-of-range case).
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
