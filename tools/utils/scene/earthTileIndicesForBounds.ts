import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import { earthTileColumns } from '../../../src/utils/scene/earthTileColumns';
import type { TileIndexRect } from './TileIndexRect';

/**
 * earthTileIndicesForBounds — which tile `(x, y)` cells at level `z` a
 * geographic box touches, as an inclusive rect. `floor` on the min edge and
 * `ceil(edge) - 1` on the max edge: an edge sitting exactly on a tile
 * boundary stays out of the tile beyond it, but any partial overlap still
 * pulls that tile in — the same rule bake callers need to avoid probing
 * tiles a source's `coverage` box can never satisfy.
 */
export function earthTileIndicesForBounds(
  bounds: LonLatBounds,
  z: number,
  tilePx: number,
): TileIndexRect {
  const columns = earthTileColumns(z, tilePx);
  const rows = columns / 2;
  const lonStep = 360 / columns;
  const latStep = 180 / rows;

  // x runs east from -180; y runs south from +90 (tile y=0 is north, see
  // `EarthTileId`), so north/south feed the same floor/ceil-1 shape as
  // west/east once flipped into a south-increasing coordinate.
  const xMin = clampIndex(Math.floor((bounds.west + 180) / lonStep), columns);
  const xMax = clampIndex(Math.ceil((bounds.east + 180) / lonStep) - 1, columns);
  const yMin = clampIndex(Math.floor((90 - bounds.north) / latStep), rows);
  const yMax = clampIndex(Math.ceil((90 - bounds.south) / latStep) - 1, rows);

  return { xMin, xMax, yMin, yMax };
}

function clampIndex(index: number, count: number): number {
  return Math.min(Math.max(index, 0), count - 1);
}
