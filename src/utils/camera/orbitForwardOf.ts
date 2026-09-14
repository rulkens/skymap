/** orbitForwardOf — an orbit camera's unit view direction, decoded from
 * `poseBasis`·(yaw, pitch) rather than `target − position`. The subtraction
 * cancels to zero when `distance` sits below the eye's f64 ULP (a metre-near
 * probe face 0.1 pc out); the decode is exact at any scale, and is the same
 * `dir` `eyeMpcOf` placed the eye along, negated. */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';
import { yawPitchToDir } from './yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';

const scratchDir: Vec3 = [0, 0, 0];

/** `out` is written in place and returned; omitted ⇒ a fresh `Vec3`. */
export function orbitForwardOf(cam: OrbitCamera, out?: Vec3): Vec3 {
  const dir = yawPitchToDir(cam.yaw, cam.pitch, scratchDir);
  const dst = rotateVec3ByTightMat3(dir, cam.poseBasis, out ?? ([0, 0, 0] as Vec3));
  dst[0] = -dst[0];
  dst[1] = -dst[1];
  dst[2] = -dst[2];
  return dst;
}
