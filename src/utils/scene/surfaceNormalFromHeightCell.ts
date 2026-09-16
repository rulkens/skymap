import type { Vec3 } from '../../@types/math/Vec3';
import { latticePostGradient } from './latticePostGradient';

/** surfaceNormalFromHeightCell — unit normal at a fragment inside cell
 *  `(col, row)` of a leaf's sub-rect, in the local (Ê, N̂, Û) frame: the four
 *  posts' own gradients, interpolated across the cell, so the normal is
 *  continuous across every post line where the drawn surface only bends.
 *  TWIN of the gradient in `earthSurfaceTile/surfaceLighting.wesl`. */
export function surfaceNormalFromHeightCell(
  postM: (col: number, row: number) => number,
  col: number,
  row: number,
  cells: number,
  u: number,
  v: number,
  /** One CELL's spacing, metres — the patch extent over the leaf's inherited
   *  `cells` (R14), never a fixed 128. */
  postSpacingEM: number,
  postSpacingNM: number,
): Vec3 {
  const nw = latticePostGradient(postM, col, row, cells);
  const ne = latticePostGradient(postM, col + 1, row, cells);
  const sw = latticePostGradient(postM, col, row + 1, cells);
  const se = latticePostGradient(postM, col + 1, row + 1, cells);
  const north = [nw[0] * (1 - u) + ne[0] * u, nw[1] * (1 - u) + ne[1] * u];
  const south = [sw[0] * (1 - u) + se[0] * u, sw[1] * (1 - u) + se[1] * u];
  const dhdE = (north[0]! * (1 - v) + south[0]! * v) / postSpacingEM;
  const dhdN = (north[1]! * (1 - v) + south[1]! * v) / postSpacingNM;
  const len = Math.hypot(dhdE, dhdN, 1);
  return [-dhdE / len, -dhdN / len, 1 / len];
}
