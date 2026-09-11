import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec4 } from '../../@types/math/Vec4';
import { rotateBasisByQuat } from './rotateBasisByQuat';

/** Turn the basis in place — the eye-pivot form of a settle rotation. */
export function poseWithBasisTurn(pose: BodyFixedPose, q: Readonly<Vec4>): BodyFixedPose {
  return { ...pose, basisLocal: rotateBasisByQuat(q, pose.basisLocal) };
}
