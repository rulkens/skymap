/**
 * ismMapDustRingEdges — the inner/outer radius of ring `ring`'s annular bin,
 * bisected against its neighbours at their geometric mean — the natural
 * midpoint on `ismMapRingRadius`'s LOG-spaced centres (an arithmetic mean
 * would skew every bin toward the inner neighbour). Edge rings clamp to the
 * map's own `rMin`/`rMax` so consecutive bins tile `[rMin, rMax]` exactly.
 * Shared by `buildIsmMapDustCdf` (texel area) and `sampleIsmMapDustCdf`
 * (radius jitter within the picked bin) so the two can't drift apart on
 * where a ring's mass actually sits.
 */
import { ismMapRingRadius } from './ismMapRingRadius';

export type IsmMapRingEdges = { readonly rInner: number; readonly rOuter: number };

export function ismMapDustRingEdges(
  ring: number,
  rings: number,
  rMin: number,
  rMax: number,
): IsmMapRingEdges {
  const center = ismMapRingRadius(ring, rings, rMin, rMax);
  const rInner =
    ring === 0 ? rMin : Math.sqrt(ismMapRingRadius(ring - 1, rings, rMin, rMax) * center);
  const rOuter =
    ring === rings - 1 ? rMax : Math.sqrt(center * ismMapRingRadius(ring + 1, rings, rMin, rMax));
  return { rInner, rOuter };
}
