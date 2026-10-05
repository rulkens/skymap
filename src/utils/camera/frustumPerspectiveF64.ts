/**
 * frustumPerspectiveF64 — an off-axis perspective from a `ViewFrustum`, f64,
 * in wgpu-matrix's conventions: finite `far` = [0,1] depth as
 * `mat4d.perspective`; `far` null = infinite reversed-Z as
 * `perspectiveReverseZ`. Term order mirrors theirs so a symmetric frustum
 * rounds alike. This is the one place every view's vp AND every slab's vp
 * get their projection row, so `clipYFlip` lands here rather than as a
 * caller post-mutating a finished vp.
 */

import type { ViewFrustum } from '../../@types/camera/ViewFrustum';

export function frustumPerspectiveF64(
  frustum: ViewFrustum,
  near: number,
  far: number | null,
  clipYFlip?: boolean,
): Float64Array {
  const { tanLeft, tanRight, tanDown, tanUp } = frustum;
  const dx = tanRight - tanLeft;
  const dy = tanUp - tanDown;
  const f = 2 / dy;
  const m = new Float64Array(16);
  // `f / aspect`, as wgpu-matrix writes it — not `2 / dx`, which rounds apart.
  m[0] = f / (dx / dy);
  m[5] = f;
  // Off-axis shift; exactly 0 for a symmetric frustum (tanLeft = −tanRight).
  m[8] = (tanLeft + tanRight) / dx;
  m[9] = (tanDown + tanUp) / dy;
  m[11] = -1;
  if (far === null) {
    m[10] = 0;
    m[14] = near;
  } else {
    const rangeInv = 1 / (near - far);
    m[10] = far * rangeInv;
    m[14] = far * near * rangeInv;
  }
  // Negating clip-y's whole row here is exactly negating the final vp's row
  // post-multiply (row i of A·B is row i of A times B), for whatever view
  // matrix a caller multiplies this by — m[1] and m[13] are always 0 above,
  // so only the two live terms need it.
  if (clipYFlip) {
    m[5] = -m[5]!;
    m[9] = -m[9]!;
  }
  return m;
}
