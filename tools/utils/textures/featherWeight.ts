import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

/**
 * featherWeight — 1 inside `core`, 0 on or outside `outer`, a smoothstep
 * across the ring between. A function of lon/lat alone, so two tiles
 * sampling the same point agree; the smoothstep's flat start keeps a post a
 * float hair inside `outer` from differing from the underfill in any bit.
 */
export function featherWeight(
  outer: LonLatBounds,
  core: LonLatBounds,
  lon: number,
  lat: number,
): number {
  const t = Math.min(
    (lon - outer.west) / (core.west - outer.west),
    (outer.east - lon) / (outer.east - core.east),
    (lat - outer.south) / (core.south - outer.south),
    (outer.north - lat) / (outer.north - core.north),
  );
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
