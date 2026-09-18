import { SURFACE_TILE_MESH_RESOLUTION } from '../../../../src/data/bodies/surfaceTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../../../src/data/scene/heightTileFormat';
import { latticeHeightSample } from '../../../../src/utils/surfaceTiles/latticeHeightSample';

/** Cells across the full raster (129 posts, 128 cells) — the same ×16 vs ×17
 *  trap `terrainHeightM.ts` guards against, here at the raster's own stride. */
const CELLS = HEIGHT_POSTS_PER_TILE - 1;
/** The drawn mesh puts a vertex on every second post of a full-tile leaf. */
const DRAWN_STRIDE = CELLS / SURFACE_TILE_MESH_RESOLUTION;

/**
 * sampleHeightTileM — height, metres above the datum, at tile-relative
 * `(colFrac, rowFrac)` on the ground as DRAWN: the vertex shader displaces
 * only every `DRAWN_STRIDE`-th post, so a bump on the posts between never
 * reaches the geometry. `heightM` is the full raster, row-major, NORTH row first.
 */
export function sampleHeightTileM(
  heightM: ArrayLike<number>,
  colFrac: number,
  rowFrac: number,
): number {
  const postM = (col: number, row: number): number => {
    const c = Math.min(CELLS, Math.max(0, col));
    const r = Math.min(CELLS, Math.max(0, row));
    return heightM[r * HEIGHT_POSTS_PER_TILE + c]!;
  };
  return latticeHeightSample(postM, [colFrac * CELLS, rowFrac * CELLS], DRAWN_STRIDE, CELLS);
}
