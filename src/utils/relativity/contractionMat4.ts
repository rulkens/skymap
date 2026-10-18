/**
 * contractionMat4 — Lorentz contraction along `dir` about the fixed point `shipRel`:
 * C = T(s) · (I − k n nᵀ) · T(−s), k = 1 − 1/γ, as a column-major f64 mat4 (wgpu-matrix order),
 * folded on the right of a slab's vp. Written out in closed form: the linear part is symmetric
 * and the translation is s − (I − k n nᵀ) s = k (n·s) n. `shipRel` must be in the frame and
 * units of the matrix it folds into; `dir` must be unit.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function contractionMat4(
  shipRel: Readonly<Vec3>,
  dir: Readonly<Vec3>,
  gamma: number,
): Float64Array {
  const k = 1 - 1 / gamma;
  const [nx, ny, nz] = dir;
  const along = k * (nx * shipRel[0] + ny * shipRel[1] + nz * shipRel[2]);
  // prettier-ignore
  return new Float64Array([
    1 - k * nx * nx, -k * nx * ny, -k * nx * nz, 0,
    -k * ny * nx, 1 - k * ny * ny, -k * ny * nz, 0,
    -k * nz * nx, -k * nz * ny, 1 - k * nz * nz, 0,
    along * nx, along * ny, along * nz, 1,
  ]);
}
