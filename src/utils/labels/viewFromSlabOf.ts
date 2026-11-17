/**
 * viewFromSlabOf — the 4×4 (column-major, f64) taking a slab's label anchors
 * into view space: rotate by `viewFromWorld` after subtracting `origin`, the
 * eye on a slab of absolute anchors, zero on one of camera-relative anchors.
 * Interim: goes once labels carry absolute hi/lo positions.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function viewFromSlabOf(
  viewFromWorld: Readonly<Mat3>,
  origin: Readonly<Vec3>,
): Float64Array {
  const m = new Float64Array(16);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = viewFromWorld[c * 3 + r]!;
  for (let r = 0; r < 3; r++) {
    m[12 + r] = -(m[r]! * origin[0] + m[4 + r]! * origin[1] + m[8 + r]! * origin[2]);
  }
  m[15] = 1;
  return m;
}
