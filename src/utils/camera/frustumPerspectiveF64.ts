/**
 * frustumPerspectiveF64 — an off-axis perspective from a `ViewFrustum`, f64,
 * in wgpu-matrix's conventions: `reverseZ` false = [0,1] depth as
 * `mat4d.perspective`, true = near→1 as `perspectiveReverseZ`; `far` null =
 * infinite. Term order mirrors theirs so a symmetric frustum rounds alike.
 */

import type { ViewFrustum } from '../../@types/camera/ViewFrustum';

export function frustumPerspectiveF64(
  frustum: ViewFrustum,
  near: number,
  far: number | null,
  reverseZ: boolean,
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
  if (reverseZ) {
    if (far === null) {
      m[10] = 0;
      m[14] = near;
    } else {
      const rangeInv = 1 / (far - near);
      m[10] = near * rangeInv;
      m[14] = far * near * rangeInv;
    }
  } else if (far === null) {
    m[10] = -1;
    m[14] = -near;
  } else {
    const rangeInv = 1 / (near - far);
    m[10] = far * rangeInv;
    m[14] = far * near * rangeInv;
  }
  return m;
}
