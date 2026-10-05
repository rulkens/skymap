/**
 * viewFromCameraEye — the eye-space transform from the camera's eye frame into
 * a `ViewSpec`'s: `e' = S·Rᵀ·S·e − S·o`, S = diag(1, 1, −1), because eye space
 * looks down −z while R's columns are right | up | FORWARD. Pre-multiplied onto
 * a lookAt view it turns and offsets every slab alike, whatever its origin.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

const S = [1, 1, -1] as const;

export function viewFromCameraEye(
  rotation: Readonly<Mat3>,
  eyeOffset: Readonly<Vec3>,
): Float64Array {
  const m = new Float64Array(16);
  for (let c = 0; c < 3; c++) {
    // (Rᵀ)[r][c] = R[c][r], stored column-major at rotation[r*3 + c].
    for (let r = 0; r < 3; r++) m[c * 4 + r] = S[r]! * rotation[r * 3 + c]! * S[c]!;
    m[12 + c] = -S[c]! * eyeOffset[c]!;
  }
  m[15] = 1;
  return m;
}
