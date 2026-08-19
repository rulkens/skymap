import type { EarthTileBand } from '../../@types/scene/EarthTileBand';

/**
 * earthTileBandRefineAllowed — true when some band overlapping this tile's uv
 * footprint bakes deeper than `z`. AABB overlap uses open intervals, matching
 * `planEarthTiles`'s own window-overlap test: an edge-touching tile is
 * adjacent, not overlapping.
 */
export function earthTileBandRefineAllowed(
  bands: readonly EarthTileBand[],
  z: number,
  uv: { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number },
): boolean {
  for (const band of bands) {
    if (
      uv.u1 > band.uBounds[0] &&
      uv.u0 < band.uBounds[1] &&
      uv.v1 > band.vBounds[0] &&
      uv.v0 < band.vBounds[1] &&
      z < band.max
    ) {
      return true;
    }
  }
  return false;
}
