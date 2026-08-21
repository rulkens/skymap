import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';
import type { GridBox } from '../../@types/GridBox';
import { boxHalfExtentMpc } from './boxHalfExtentMpc';

/**
 * Box-local -> world Mpc, the exact inverse of worldToBoxLocal: R (not the
 * conjugate) applied to the recentred offset.
 */
export function boxLocalToWorld(box: GridBox, q: Readonly<Vec3>): Vec3 {
  const half = boxHalfExtentMpc(box.sizeMpc);
  const centered: Vec3 = [q[0] - half[0], q[1] - half[1], q[2] - half[2]];
  const rotated = rotateVec3ByQuat(box.rotation, centered);
  return [
    rotated[0] + box.centerMpc[0],
    rotated[1] + box.centerMpc[1],
    rotated[2] + box.centerMpc[2],
  ];
}
