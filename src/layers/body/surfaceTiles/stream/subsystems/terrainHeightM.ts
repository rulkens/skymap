import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { ResidentHeightLookup } from '../@types/ResidentHeightLookup';
import { SURFACE_TILE_PX } from '../../format/data/surfaceTileParams';
import { HEIGHT_CODE_BYTES, HEIGHT_GRID_POSTS_PER_EDGE } from '../../format/data/heightTileFormat';
import { codeHeightM } from '../../format/utils/codeHeightM';
import { deepestResidentAncestor } from '../../plan/subsystems/deepestResidentAncestor';
import { latticeHeightSample } from '../../format/utils/latticeHeightSample';
import { surfaceTilePointAt } from '../../format/utils/surfaceTilePointAt';

/** Grid posts span this many cells (17 posts, 16 cells): the ×16 vs ×17 trap
 *  (spec F1) — using the post COUNT as the fraction's divisor is wrong by a
 *  sub-texel amount that grows with level. */
const GRID_CELLS_PER_EDGE = HEIGHT_GRID_POSTS_PER_EDGE - 1;

/**
 * terrainHeightM — bilinear terrain height (metres above the datum) under a
 * body-fixed direction, read from the deepest resident ancestor's 17×17 SHGT
 * grid (spec §8.4). Three production call sites can pass a degenerate
 * direction; it must answer 0 like any other miss (`surfaceTilePointAt`'s null),
 * because a `NaN` here becomes a `NaN` camera position and a black screen.
 */
export function terrainHeightM(
  dirBodyFixed: Readonly<Vec3>,
  deepestLevel: number,
  baseLevel: number,
  resident: ResidentHeightLookup,
): number {
  const z = deepestLevel;
  const point = surfaceTilePointAt(dirBodyFixed, z, SURFACE_TILE_PX);
  if (point === null) return 0;
  const { x, y } = point;
  const [colFrac, rowFrac] = point.uv;

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
    // `rowFracInAnc` reaches exactly 1 at the south pole (`surfaceTilePointAt` clamps it),
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
