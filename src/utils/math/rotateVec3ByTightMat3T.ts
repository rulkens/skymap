/**
 * rotateVec3ByTightMat3T — `Mᵀ·v` for a TIGHT column-major 3×3 rotation:
 * the world→local inverse of `rotateVec3ByTightMat3` (orthonormal, so the
 * transpose is the inverse). Each output component is the dot of a COLUMN
 * with `v` — the same three-multiply-add form `orbitAnglesLookingAlong` and
 * `bodyRelativePose` hand-roll.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function rotateVec3ByTightMat3T(v: Readonly<Vec3>, m: Readonly<Mat3>): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
