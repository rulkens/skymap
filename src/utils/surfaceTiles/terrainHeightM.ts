import type { Vec3 } from '../../@types/math/Vec3';
import type { ResidentHeightLookup } from '../../@types/scene/ResidentHeightLookup';
import { SURFACE_TILE_PX } from '../../data/bodies/surfaceTileParams';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';
import { HEIGHT_CODE_BYTES, HEIGHT_GRID_POSTS_PER_EDGE } from '../../data/scene/heightTileFormat';
import { codeHeightM } from './codeHeightM';
import { deepestResidentAncestor } from './deepestResidentAncestor';
import { latticeHeightSample } from './latticeHeightSample';
import { surfaceTileColumns } from './surfaceTileColumns';
import { surfaceTileXyForUv } from './surfaceTileXyForUv';

/** Grid posts span this many cells (17 posts, 16 cells): the ×16 vs ×17 trap
 *  (spec F1) — using the post COUNT as the fraction's divisor is wrong by a
 *  sub-texel amount that grows with level. */
const GRID_CELLS_PER_EDGE = HEIGHT_GRID_POSTS_PER_EDGE - 1;

/**
 * terrainHeightM — bilinear terrain height (metres above the datum) under a
 * body-fixed direction, read from the deepest resident ancestor's 17×17 SHGT
 * grid (spec §8.4). Three production call sites can pass a degenerate
 * direction; it must answer 0 like any other miss, because a `NaN` here
 * becomes a `NaN` camera position and a black screen with no error.
 */
export function terrainHeightM(
  dirBodyFixed: Readonly<Vec3>,
  deepestLevel: number,
  baseLevel: number,
  resident: ResidentHeightLookup,
): number {
  const [dx, dy, dz] = dirBodyFixed;
  const magM = Math.hypot(dx, dy, dz);
  // `isFinite`, not `=== 0`: a NaN or Infinity component has to take this exit
  // too, or it survives `atan2`/`asin` and lands in the camera position.
  if (!Number.isFinite(magM) || magM === 0) return 0;

  // Exact inverse of `equirectUvToDirection`'s `lon/lat → direction` (atan2/asin
  // with local-Z the pole), then back through the shared prime-meridian
  // registration to mesh uv. Co-moves with that function and with
  // `directionToLonLatDeg`, which spells the same inversion in degrees.
  const lon = Math.atan2(dy / magM, dx / magM);
  const lat = Math.asin(Math.min(1, Math.max(-1, dz / magM)));
  const u = lon / (2 * Math.PI) + TEXTURE_PRIME_MERIDIAN_U;
  const v = lat / Math.PI + 0.5;

  const z = deepestLevel;
  const cols = surfaceTileColumns(z, SURFACE_TILE_PX);
  const rows = cols / 2;
  const [x, y] = surfaceTileXyForUv([u, v], z, SURFACE_TILE_PX);

  // The fractional remainder of the SAME `(1 - v) * rows` that produced `y`:
  // row 0 is the grid's NORTH row (heightTileFormat.ts) and this quantity
  // already increases southward from it, exactly as `y` does — the north/south
  // flip (trap 2) lives in that shared `1 - v`, not in a second formula here.
  const colFrac = u * cols - Math.floor(u * cols);
  const rowFrac = Math.min(1, Math.max(0, (1 - v) * rows - y));

  const hit = deepestResidentAncestor({ product: 'height', z, x, y }, baseLevel, resident);
  if (hit === null) return 0;

  const span = 1 << hit.levelDelta;
  const ancX = x >> hit.levelDelta;
  const ancY = y >> hit.levelDelta;
  // Position within the ancestor tile's own [0, 1): collapse the leaf's
  // absolute column/row by `span` before subtracting the ancestor's origin.
  const colFracInAnc = (x + colFrac) / span - ancX;
  const rowFracInAnc = (y + rowFrac) / span - ancY;

  const grid = hit.found.gridCodes;
  const postM = (col: number, row: number): number => {
    // `rowFracInAnc` reaches exactly 1 at the south pole (line 55 clamps it),
    // and a post on the tile's far edge is one float rounding from the same
    // place — either way the far post index is 16, never 17.
    const c = Math.min(GRID_CELLS_PER_EDGE, Math.max(0, col));
    const r = Math.min(GRID_CELLS_PER_EDGE, Math.max(0, row));
    const offset = (r * HEIGHT_GRID_POSTS_PER_EDGE + c) * HEIGHT_CODE_BYTES;
    const code = (grid[offset]! << 16) | (grid[offset + 1]! << 8) | grid[offset + 2]!;
    return codeHeightM(code);
  };

  return latticeHeightSample(
    postM,
    [colFracInAnc * GRID_CELLS_PER_EDGE, rowFracInAnc * GRID_CELLS_PER_EDGE],
    1,
    GRID_CELLS_PER_EDGE,
  );
}
