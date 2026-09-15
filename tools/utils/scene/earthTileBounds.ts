import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import { surfaceTileColumns } from '../../../src/utils/scene/surfaceTileColumns';

/** Geographic extent of tile `(z, x, y)`; `y` increases SOUTH, matching the
 *  raster's own north-first row order. */
export function earthTileBounds(z: number, x: number, y: number, tilePx: number): LonLatBounds {
  const columns = surfaceTileColumns(z, tilePx);
  const rows = columns / 2;
  const lonStep = 360 / columns;
  const latStep = 180 / rows;
  return {
    west: -180 + x * lonStep,
    east: -180 + (x + 1) * lonStep,
    north: 90 - y * latStep,
    south: 90 - (y + 1) * latStep,
  };
}
