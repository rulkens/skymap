import type { BodyFixedPose } from '../../../../../../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../../../../../../@types/math/Vec3';
import { bodyFixedEyeM } from '../../../../../../../utils/camera/surfaceFrame/bodyFixedEyeM';
import { rotateBasisByQuat } from '../../../../orientation/utils/rotateBasisByQuat';
import { multiplyQuat } from '../../../../../../../utils/math/multiplyQuat';
import { normalize3 } from '../../../../../../../utils/math/normalize3';
import { quatFromAxisAngle } from '../../../../../../../utils/math/quatFromAxisAngle';

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
