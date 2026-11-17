import type { BodyFixedPose } from '../../../@types/camera/pose/BodyFixedPose';
import type { Vec3 } from '../../../@types/math/Vec3';

export function bodyFixedEyeM(pose: BodyFixedPose): Vec3 {
  const { anchorLocalM: a, eyeRelAnchorM: e } = pose;
  return [a[0] + e[0], a[1] + e[1], a[2] + e[2]];
}
