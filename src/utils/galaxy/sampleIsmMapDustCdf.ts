/**
 * sampleSfMapDustCdf — S1's sample step: one upper-bound binary search over
 * `buildSfMapDustCdf`'s prefix sum (~18 steps for a 768x256 grid) picks a
 * texel exactly proportional to its accumulated mass, then jitters INSIDE
 * that texel's footprint — uniform in angle, area-uniform in radius
 * (`r = sqrt(r0^2 + u*(r1^2-r0^2))`) — reconstructing the map
 * piecewise-constant at its own resolution instead of collapsing every draw
 * onto the texel centre.
 *
 * Exactly THREE rng draws every call (bin pick, angle jitter, radius
 * jitter) — fixed regardless of map contrast, unlike the rejection loop it
 * replaces — so a placement's downstream draws never re-roll when only the
 * map changes (see clusteredDiscPlacement.ts's header on why draw order is
 * load-bearing).
 */
import { sfMapDustRingEdges } from './ismMapDustRingEdges';
import type { GalaxySfMapDustCdf } from '../../@types/galaxy/GalaxyIsmMapDustCdf';

export type SfMapDustCdfSample = { readonly radius: number; readonly angle: number };

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

export function sampleSfMapDustCdf(cdf: GalaxySfMapDustCdf, rng: () => number): SfMapDustCdfSample {
  const { az, rings, rMin, rMax, prefix, total } = cdf;
  const index = upperBound(prefix, rng() * total);
  const ring = Math.floor(index / az);
  const azIdx = index % az;

  const dTheta = (2 * Math.PI) / az;
  const angle = azIdx * dTheta + rng() * dTheta;

  const { rInner, rOuter } = sfMapDustRingEdges(ring, rings, rMin, rMax);
  const radius = Math.sqrt(rInner * rInner + rng() * (rOuter * rOuter - rInner * rInner));

  return { radius, angle };
}
