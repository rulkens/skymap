import { HEIGHT_POSTS_PER_TILE } from '../../../src/data/scene/heightTileFormat';
import { latticeHeightSample } from '../../../src/utils/surfaceTiles/latticeHeightSample';

/** Cells across the full raster (129 posts, 128 cells) — the same ×16 vs ×17
 *  trap `terrainHeightM.ts` guards against, here at the raster's own stride. */
const CELLS = HEIGHT_POSTS_PER_TILE - 1;

/**
 * sampleHeightTileM — bilinear height, metres above the datum, at tile-relative
 * `(colFrac, rowFrac)` in a decoded tile's full 129x129 raster: the SAME surface
 * the shader displaces against, not the decimated SHGT grid `terrainHeightM`
 * climbs at runtime. `heightM` is row-major, NORTH row first.
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
  return latticeHeightSample(postM, [colFrac * CELLS, rowFrac * CELLS], 1, CELLS);
}
