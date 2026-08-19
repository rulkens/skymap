import type { EarthTileBand } from '../../@types/scene/EarthTileBand';
import { earthTileBandOverlapsUv } from './earthTileBandOverlapsUv';

/**
 * earthTileBandRefineAllowed — true when some band overlapping this tile's uv
 * footprint bakes deeper than `z`.
 */
export function earthTileBandRefineAllowed(
  bands: readonly EarthTileBand[],
  z: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): boolean {
  for (const band of bands) {
    if (z < band.max && earthTileBandOverlapsUv(band, u0, u1, v0, v1)) return true;
  }
  return false;
}
