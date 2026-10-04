import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { rotateBasisByQuat } from './rotateBasisByQuat';
import { multiplyQuat } from '../math/multiplyQuat';
import { normalize3 } from '../math/normalize3';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';

/**
 * Turns the view about the eye by screen radians. Yaw is about the LOCAL
 * vertical rather than the camera's own up: that keeps the horizon level at
 * every latitude and azimuth (probe defect 3). The eye is not touched — this
 * is the only route to the sky.
 */
export function lookedSurfacePose(
  arm: BodyFixedPose,
  yawRad: number,
  pitchRad: number,
): BodyFixedPose {
  const b = arm.basisLocal;
  const right: Vec3 = [b[0], b[1], b[2]];
  const q = multiplyQuat(
    quatFromAxisAngle(right, pitchRad),
    quatFromAxisAngle(normalize3(bodyFixedEyeM(arm)), yawRad),
  );
  return { ...arm, basisLocal: rotateBasisByQuat(q, arm.basisLocal) };
}
