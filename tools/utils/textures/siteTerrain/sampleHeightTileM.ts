import { SURFACE_TILE_MESH_RESOLUTION } from '../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../../../src/layers/body/surfaceTiles/format/data/heightTileFormat';

/** Cells across the full raster (129 posts, 128 cells) — the same ×16 vs ×17
 *  trap `terrainHeightM.ts` guards against, here at the raster's own stride. */
const CELLS = HEIGHT_POSTS_PER_TILE - 1;
/** The drawn mesh puts a vertex on every second post of a full-tile leaf. */
const DRAWN_STRIDE = CELLS / SURFACE_TILE_MESH_RESOLUTION;

/**
 * sampleHeightTileM — height, metres above the datum, at tile-relative
 * `(colFrac, rowFrac)` on the ground as DRAWN: the vertex shader displaces
 * only every `DRAWN_STRIDE`-th post, so a bump on the posts between never
 * reaches the geometry, and each cell is two flat triangles split along its
 * SE–NW diagonal (`surfacePatchIndices`), not a bilinear patch.
 * `heightM` is the full raster, row-major, NORTH row first.
 */
export function sampleHeightTileM(
  heightM: ArrayLike<number>,
  colFrac: number,
  rowFrac: number,
): number {
  const vertexM = (i: number, j: number): number => {
    const c = Math.min(CELLS, Math.max(0, i * DRAWN_STRIDE));
    const r = Math.min(CELLS, Math.max(0, j * DRAWN_STRIDE));
    return heightM[r * HEIGHT_POSTS_PER_TILE + c]!;
  };
  const x = colFrac * SURFACE_TILE_MESH_RESOLUTION;
  const y = rowFrac * SURFACE_TILE_MESH_RESOLUTION;
  const i = Math.min(SURFACE_TILE_MESH_RESOLUTION - 1, Math.floor(x));
  const j = Math.min(SURFACE_TILE_MESH_RESOLUTION - 1, Math.floor(y));
  const east = x - i;
  const north = 1 - (y - j);
  // Row j is the cell's north edge, j + 1 its south edge.
  const sw = vertexM(i, j + 1);
  const se = vertexM(i + 1, j + 1);
  const nw = vertexM(i, j);
  if (east + north <= 1) return sw + east * (se - sw) + north * (nw - sw);
  const ne = vertexM(i + 1, j);
  return ne + (1 - east) * (nw - ne) + (1 - north) * (se - ne);
}
