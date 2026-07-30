import { EARTH_EQUIRECT_BASE_WIDTH_PX } from '../../data/bodies/earthTileParams';

/**
 * earthTileColumns — how many tiles span 360° of longitude at pyramid level
 * `z`, given a `tilePx` tile edge. Row count is NOT returned alongside it: the
 * equirect raster is always twice as wide as tall, so rows are
 * `columns / 2` by construction, and returning both would invite drift.
 *
 * At the shipped 512 px edge, level `z` is simply `2^z` columns — why a
 * 512 px tile is the exact 2×2 union of four 256 px source tiles.
 */
export function earthTileColumns(z: number, tilePx: number): number {
  return (EARTH_EQUIRECT_BASE_WIDTH_PX << z) / tilePx;
}
