import type { Vec3 } from '../../@types/math/Vec3';

/**
 * surfaceNormalFromHeightCell — the unit normal of the bilinear cell a fragment
 * lies in, from that cell's own four posts, in the local (Ê, N̂, Û) frame. TWIN
 * of the gradient in `earthSurfaceTile/fragment.wesl`, with no production caller
 * by design. Spec §7.2's FORWARD difference: a central one goes one-sided at the
 * 129th post and draws a seam along every tile edge.
 */
export function surfaceNormalFromHeightCell(
  /** Posts by compass corner, never by index: the atlas's row index increases
   *  SOUTHWARD, and an `(i, j)` spelling is one flip from lighting every slope
   *  backwards. `u` runs east across the cell, `v` runs SOUTH; both in [0, 1). */
  hNW: number,
  hNE: number,
  hSW: number,
  hSE: number,
  u: number,
  v: number,
  postSpacingEM: number,
  postSpacingNM: number,
): Vec3 {
  const dhdE = ((hNE - hNW) * (1 - v) + (hSE - hSW) * v) / postSpacingEM;
  const dhdN = ((hNW - hSW) * (1 - u) + (hNE - hSE) * u) / postSpacingNM;
  const len = Math.hypot(dhdE, dhdN, 1);
  return [-dhdE / len, -dhdN / len, 1 / len];
}
