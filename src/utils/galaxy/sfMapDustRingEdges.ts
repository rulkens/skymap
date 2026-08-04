/**
 * sfMapDustRingEdges — the inner/outer radius of ring `ring`'s annular bin,
 * bisected against its neighbours at their geometric mean (the natural
 * midpoint on the LOG-spaced grid `sfMapRingRadius` places ring centres on —
 * an arithmetic mean would skew every bin toward the inner neighbour). Edge
 * rings clamp to the map's own `rMin`/`rMax` rather than extrapolating past
 * them, so consecutive bins tile `[rMin, rMax]` exactly with no gap or
 * overlap. Shared by `buildSfMapDustCdf` (texel area) and
 * `sampleSfMapDustCdf` (radius jitter within the picked bin) so the two
 * can't drift apart on where a ring's mass actually sits.
 */
import { sfMapRingRadius } from './sfMapRingRadius';

export type SfMapRingEdges = { readonly rInner: number; readonly rOuter: number };

export function sfMapDustRingEdges(
  ring: number,
  rings: number,
  rMin: number,
  rMax: number,
): SfMapRingEdges {
  const center = sfMapRingRadius(ring, rings, rMin, rMax);
  const rInner =
    ring === 0 ? rMin : Math.sqrt(sfMapRingRadius(ring - 1, rings, rMin, rMax) * center);
  const rOuter =
    ring === rings - 1 ? rMax : Math.sqrt(center * sfMapRingRadius(ring + 1, rings, rMin, rMax));
  return { rInner, rOuter };
}
