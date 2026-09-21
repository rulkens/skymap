/**
 * turnedOrbitCamera — a rig view's camera as an `OrbitCamera`, so every
 * `ctx.cam` reader (ray-marched shells, billboard axes) draws that view. The
 * basis rides `poseBasis`/`upBasis` at yaw = pitch = roll = 0, the trick
 * a capture face's basis uses; `distance` stays the orbit's so distance gates agree.
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { ViewFrustum } from '../../@types/camera/ViewFrustum';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function turnedOrbitCamera(
  cam: OrbitCamera,
  /** The view's right | up | forward, world-space columns. */
  viewBasisWorld: Readonly<Mat3>,
  eyeMpc: Readonly<Vec3>,
  frustum: ViewFrustum,
): OrbitCamera {
  const b = viewBasisWorld;
  // `orbitForwardOf` decodes forward as −(third column) at yaw = pitch = 0;
  // `frameUp` reads screen-up from the middle one.
  const basis: Mat3 = [b[0], b[1], b[2], b[3], b[4], b[5], -b[6], -b[7], -b[8]];
  const { distance } = cam;
  return {
    target: [eyeMpc[0] + b[6] * distance, eyeMpc[1] + b[7] * distance, eyeMpc[2] + b[8] * distance],
    distance,
    yaw: 0,
    pitch: 0,
    roll: 0,
    poseBasis: basis,
    upBasis: basis,
    // An off-axis frustum has no exact (fovY, aspect); these are its extents.
    fovYRad: Math.atan(frustum.tanUp) - Math.atan(frustum.tanDown),
    aspect: (frustum.tanRight - frustum.tanLeft) / (frustum.tanUp - frustum.tanDown),
    near: cam.near,
    far: cam.far,
    position: [eyeMpc[0], eyeMpc[1], eyeMpc[2]],
  };
}
