import { EARTH_EQUIRECT_BASE_WIDTH_PX } from '../../data/bodies/earthTileParams';

/**
 * earthTileColumns — how many tiles span the full 360° of longitude at pyramid
 * level `z`, given a `tilePx` tile edge.
 *
 * The row count is deliberately NOT returned alongside it: on a plate-carrée
 * grid the equirectangular raster is always exactly twice as wide as it is tall,
 * so rows are `columns / 2` by construction and returning both would invite the
 * two to be passed around separately and drift. Callers that need rows divide.
 *
 * Level `z`'s full equirect width is `EARTH_EQUIRECT_BASE_WIDTH_PX << z` texels,
 * so the column count is that over the tile edge. With the shipped 512 px edge
 * the two cancel and level `z` is simply `2^z` columns wide — which is why a
 * 512 px tile is the exact 2 × 2 union of four tiles from a 256 px source grid,
 * and why the bake is a merge rather than a resample.
 */
export function earthTileColumns(z: number, tilePx: number): number {
  return (EARTH_EQUIRECT_BASE_WIDTH_PX << z) / tilePx;
}
