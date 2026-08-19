import type { EarthTileBand } from '../../@types/scene/EarthTileBand';

/**
 * earthTileBandOverlapsUv — open-interval AABB test shared by the two band
 * predicates so they can't silently diverge (a divergence would leave tiles
 * that refine but are never requested). Four scalars, not a uv object: the
 * quadtree walk in `planEarthTiles` calls this per node, per frame.
 */
export function earthTileBandOverlapsUv(
  band: EarthTileBand,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): boolean {
  return (
    u1 > band.uBounds[0] && u0 < band.uBounds[1] && v1 > band.vBounds[0] && v0 < band.vBounds[1]
  );
}
