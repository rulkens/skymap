import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';
import type { GridBox } from '../../@types/GridBox';
import { boxHalfExtentMpc } from './boxHalfExtentMpc';

/**
 * World Mpc -> "box-local": origin at the box's own (0,0,0) corner, range
 * [0, sizeMpc] per axis — the frame worldToVoxel already returns pre-scale.
 * R⁻¹ is rotateVec3ByQuat with the conjugate of box.rotation — a unit
 * quaternion's inverse is its conjugate, so no separate invert helper.
 */
export function worldToBoxLocal(box: GridBox, p: Readonly<Vec3>): Vec3 {
  const half = boxHalfExtentMpc(box.sizeMpc);
  const centered: Vec3 = [
    p[0] - box.centerMpc[0],
    p[1] - box.centerMpc[1],
    p[2] - box.centerMpc[2],
  ];
  const [x, y, z, w] = box.rotation;
  const conjugate: Vec4 = [-x, -y, -z, w];
  const rotated = rotateVec3ByQuat(conjugate, centered);
  return [rotated[0] + half[0], rotated[1] + half[1], rotated[2] + half[2]];
}
