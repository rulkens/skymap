import type { Vec3 } from '../../@types/math/Vec3';

/** surfaceNormalFromHeightCell — unit normal of the bilinear cell a fragment
 *  lies in, in the local (Ê, N̂, Û) frame. TWIN of the gradient in
 *  `earthSurfaceTile/fragment.wesl`. */
export function surfaceNormalFromHeightCell(
  /** By compass corner, never by index: the atlas's row index increases
   *  SOUTHWARD, so an `(i, j)` spelling is one flip from lighting every slope backwards. */
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
