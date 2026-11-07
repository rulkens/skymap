/**
 * viewCornerRays — the camera's four corner rays in world axes, from the same
 * forward/roll/up basis `computeViewProj` builds its view matrix from, so a
 * pixel's reconstructed ray lands where the scene drew it. Directions only:
 * no position enters, so no Mpc-scale value is ever narrowed.
 */

import type { OrbitCamera } from '../../../@types/camera/orbitCamera/OrbitCamera';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { ViewCornerRays } from '../../../@types/camera/projection/ViewCornerRays';
import type { Vec3 } from '../../../@types/math/Vec3';
import { imagePlaneBasis } from '../orbitPose/imagePlaneBasis';
import { frameUp } from '../orbitPose/frameUp';
import { orbitForwardOf } from '../orbitPose/orbitForwardOf';

export function viewCornerRays(cam: OrbitCamera, frustum: ViewFrustum): ViewCornerRays {
  const f = orbitForwardOf(cam);
  const { right, up } = imagePlaneBasis(f, cam.roll ?? 0, frameUp(cam.upBasis));
  const ray = (tx: number, ty: number): Vec3 => [
    f[0] + right[0] * tx + up[0] * ty,
    f[1] + right[1] * tx + up[1] * ty,
    f[2] + right[2] * tx + up[2] * ty,
  ];
  return {
    tl: ray(frustum.tanLeft, frustum.tanUp),
    tr: ray(frustum.tanRight, frustum.tanUp),
    bl: ray(frustum.tanLeft, frustum.tanDown),
    br: ray(frustum.tanRight, frustum.tanDown),
  };
}
