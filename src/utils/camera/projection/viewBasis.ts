/**
 * viewBasis — the camera's forward / right / up in world axes, from the same
 * forward, roll and frame-up `computeViewProj` builds its view matrix from, so
 * anything reconstructed or projected with it lands where the scene drew.
 */

import type { OrbitCamera } from '../../../@types/camera/orbitCamera/OrbitCamera';
import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import { imagePlaneBasis } from '../orbitPose/imagePlaneBasis';
import { frameUp } from '../orbitPose/frameUp';
import { orbitForwardOf } from '../orbitPose/orbitForwardOf';

export function viewBasis(cam: OrbitCamera): ViewBasis {
  const forward = orbitForwardOf(cam);
  const { right, up } = imagePlaneBasis(forward, cam.roll ?? 0, frameUp(cam.upBasis));
  return { forward, right: [right[0], right[1], right[2]], up: [up[0], up[1], up[2]] };
}
