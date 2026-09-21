/**
 * symmetricFrustum — a camera's fovY/aspect pair in tangent form. `tan(fovY/2)`
 * (not wgpu-matrix's `tan(π/2 − fovY/2)`) because `2 / (2·tanUp)` then equals
 * `perspectiveReverseZ`'s `1 / tan(fovY/2)` bit for bit — the NEAR0 slabs' form.
 */

import type { ViewFrustum } from '../../@types/camera/ViewFrustum';

export function symmetricFrustum(fovYRad: number, aspect: number): ViewFrustum {
  const tanUp = Math.tan(fovYRad / 2);
  const tanRight = tanUp * aspect;
  return { tanLeft: -tanRight, tanRight, tanDown: -tanUp, tanUp };
}
