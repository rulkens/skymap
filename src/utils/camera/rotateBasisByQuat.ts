/**
 * rotateBasisByQuat — turn a `BodyFixedPose.basisLocal` rigidly by `q`.
 * `reorthonormalise` rebuilds its third column as `c0 × c1`, but this is the
 * image-plane basis, where `right × up = −forward`: passing the columns as
 * (forward, up, right) lands the right axis there and leaves forward exact.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec4 } from '../../@types/math/Vec4';
import { rotateVec3ByQuat } from '../math/rotateVec3ByQuat';
import { reorthonormalise } from '../math/reorthonormalise';

export function rotateBasisByQuat(q: Readonly<Vec4>, basisLocal: Readonly<Mat3>): Mat3 {
  const b = basisLocal;
  const right = rotateVec3ByQuat(q, [b[0], b[1], b[2]]);
  const up = rotateVec3ByQuat(q, [b[3], b[4], b[5]]);
  const forward = rotateVec3ByQuat(q, [b[6], b[7], b[8]]);
  const [fx, fy, fz, ux, uy, uz, rx, ry, rz] = reorthonormalise([...forward, ...up, ...right]);
  return [rx, ry, rz, ux, uy, uz, fx, fy, fz];
}
