import type { EarthTileBand } from '../../@types/scene/EarthTileBand';

/**
 * earthTileBandRequestAllowed — true when some band overlapping this tile's
 * uv footprint actually bakes a file at `z` (`band.min <= z <= band.max`).
 * Same AABB overlap test as `earthTileBandRefineAllowed`.
 */
export function earthTileBandRequestAllowed(
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
      z >= band.min &&
      z <= band.max
    ) {
      return true;
    }
  }
  return false;
}
