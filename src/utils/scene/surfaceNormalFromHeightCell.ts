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
  /** The PATCH's extent, metres — the cell's own spacing is this over `cells`,
   *  which is the leaf's inherited lattice (R14), never a fixed 128. */
  patchExtentEM: number,
  patchExtentNM: number,
  cells: number,
): Vec3 {
  const dhdE = (((hNE - hNW) * (1 - v) + (hSE - hSW) * v) * cells) / patchExtentEM;
  const dhdN = (((hNW - hSW) * (1 - u) + (hNE - hSE) * u) * cells) / patchExtentNM;
  const len = Math.hypot(dhdE, dhdN, 1);
  return [-dhdE / len, -dhdN / len, 1 / len];
}
