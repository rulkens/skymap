/**
 * marsGlobalRasters — the whole-globe Viking colour and MOLA height grids,
 * shared constants so a consumer (the Mars bake, the albedo bench) states
 * each raster's shape once. Bounds/pixel sizes are the mosaics' own headers,
 * not ±180/±90 literals: `gdalinfo` puts the outer edges ~0.004° past exact
 * on a 128 px/° grid, and the true grid is exactly global.
 */

import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import { rawDataPath } from '../../utils/io/rawDataRegistry';
import type { GeoTiffGrid } from '../@types/GeoTiffGrid';

const WHOLE_GLOBE: LonLatBounds = { west: -180, east: 180, south: -90, north: 90 };

export const VIKING_MDIM21_GRID: GeoTiffGrid = {
  path: rawDataPath('viking.mdim21'),
  width: 92160,
  height: 46080,
  bounds: WHOLE_GLOBE,
};

export const MOLA_DEM463: { readonly grid: GeoTiffGrid; readonly nodata: number } = {
  grid: {
    path: rawDataPath('mola.dem463'),
    width: 46080,
    height: 23040,
    bounds: WHOLE_GLOBE,
  },
  nodata: -32768,
};
