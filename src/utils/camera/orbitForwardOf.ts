/** orbitForwardOf — an orbit camera's unit view direction, decoded from
 * `poseBasis`·(yaw, pitch) rather than `target − position`. The subtraction
 * cancels to zero when `distance` sits below the eye's f64 ULP (a metre-near
 * probe face 0.1 pc out); the decode is exact at any scale, and is the same
 * `dir` `eyeMpcOf` placed the eye along, negated. A non-zero `lookOffset` then
 * turns it about the eye: yaw about the frame up, pitch about the resulting
 * right; the single place a view builder learns of the offset. */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';
import { yawPitchToDir } from './yawPitchToDir';
import { frameUp } from './frameUp';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { rotateVec3ByQuat } from '../math/rotateVec3ByQuat';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';

const scratchDir: Vec3 = [0, 0, 0];

/** `out` is written in place and returned; omitted ⇒ a fresh `Vec3`. */
export function orbitForwardOf(cam: OrbitCamera, out?: Vec3): Vec3 {
  const dir = yawPitchToDir(cam.yaw, cam.pitch, scratchDir);
  const dst = rotateVec3ByTightMat3(dir, cam.poseBasis, out ?? ([0, 0, 0] as Vec3));
  dst[0] = -dst[0];
  dst[1] = -dst[1];
  dst[2] = -dst[2];
  const offset = cam.lookOffset;
  // Absent and [0, 0] must share one path bit for bit, or every golden drifts.
  if (offset === undefined || (offset[0] === 0 && offset[1] === 0)) return dst;
  const up = frameUp(cam.upBasis);
  const yawed = rotateVec3ByQuat(quatFromAxisAngle(up, offset[0]), dst);
  // `yawed × up` is right-handed screen right, so +pitch tilts toward the frame up.
  const right = normalize3(cross3(yawed, up));
  const turned = rotateVec3ByQuat(quatFromAxisAngle(right, offset[1]), yawed);
  dst[0] = turned[0];
  dst[1] = turned[1];
  dst[2] = turned[2];
  return dst;
}
