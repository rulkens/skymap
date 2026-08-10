/**
 * Exception: dust-CDF sampling math, unreadable without the derivation.
 *
 * One upper-bound binary search over `buildIsmMapDustCdf`'s prefix sum picks
 * a texel proportional to its mass, then jitters inside that texel's
 * footprint — uniform in angle, area-uniform in radius (`r = sqrt(r0^2 +
 * u*(r1^2-r0^2))`) — so the map reconstructs piecewise-constant rather than
 * collapsing every draw onto the texel centre.
 *
 * Three rng draws every call, independent of map contrast, keep a
 * placement's downstream draws from re-rolling when only the map changes
 * (draw order is load-bearing — see `clusteredDiscPlacement.ts`).
 */
import { ismMapDustRingEdges } from './ismMapDustRingEdges';
import type { GalaxyIsmMapDustCdf } from '../../@types/galaxy/GalaxyIsmMapDustCdf';

export type IsmMapDustCdfSample = { readonly radius: number; readonly angle: number };

/** First index with `prefix[index] > u` — `u` drawn strictly below `prefix[length-1] === total`, so this never runs off the end. */
function upperBound(prefix: Float32Array, u: number): number {
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid]! > u) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function sampleIsmMapDustCdf(
  cdf: GalaxyIsmMapDustCdf,
  rng: () => number,
): IsmMapDustCdfSample {
  const { az, rings, rMin, rMax, prefix, total } = cdf;
  const index = upperBound(prefix, rng() * total);
  const ring = Math.floor(index / az);
  const azIdx = index % az;

  const dTheta = (2 * Math.PI) / az;
  const angle = azIdx * dTheta + rng() * dTheta;

  const { rInner, rOuter } = ismMapDustRingEdges(ring, rings, rMin, rMax);
  const radius = Math.sqrt(rInner * rInner + rng() * (rOuter * rOuter - rInner * rInner));

  return { radius, angle };
}
