import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { rotateBasisByQuat } from './rotateBasisByQuat';
import { rotateVec3ByQuat } from '../math/rotateVec3ByQuat';

/** Turn the whole pose — eye and basis — about a body-fixed point. */
export function rotatedAboutPoint(
  pose: BodyFixedPose,
  q: Readonly<Vec4>,
  pivotM: Readonly<Vec3>,
): BodyFixedPose {
  const eyeM = bodyFixedEyeM(pose);
  const relM = rotateVec3ByQuat(q, [eyeM[0] - pivotM[0], eyeM[1] - pivotM[1], eyeM[2] - pivotM[2]]);
  const { anchorLocalM: a } = pose;
  return {
    ...pose,
    eyeRelAnchorM: [
      pivotM[0] + relM[0] - a[0],
      pivotM[1] + relM[1] - a[1],
      pivotM[2] + relM[2] - a[2],
    ],
    basisLocal: rotateBasisByQuat(q, pose.basisLocal),
  };
}
