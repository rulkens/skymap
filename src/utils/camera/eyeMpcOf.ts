/** eyeMpcOf — the world eye of an orbit pose, Mpc: `target + distance · dir`,
 * `dir` being the frame-local `(yaw, pitch)` decode rotated by the STEADY
 * `poseBasis` (never `upBasis` — see `OrbitCameraInit.d.ts`). One derivation for
 * `updatePosition` and the regime predicate (spec §4); `undefined` = identity. */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { yawPitchToDir } from './yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';

// Module scratch so the per-frame path never allocates. TWO buffers: the
// matrix-vector product reads all three inputs while writing its output.
const scratchDir: Vec3 = [0, 0, 0];
const scratchWorld: Vec3 = [0, 0, 0];

/** `out` is written in place and returned; omitted ⇒ a fresh `Vec3`. */
export function eyeMpcOf(
  pose: CameraPose,
  poseBasis: Readonly<Mat3> | undefined,
  out?: Vec3,
): Vec3 {
  const dir = yawPitchToDir(pose.yaw, pose.pitch, scratchDir);
  const world = rotateVec3ByTightMat3(dir, poseBasis, scratchWorld);
  const dst = out ?? ([0, 0, 0] as Vec3);
  dst[0] = pose.target[0] + world[0] * pose.distance;
  dst[1] = pose.target[1] + world[1] * pose.distance;
  dst[2] = pose.target[2] + world[2] * pose.distance;
  return dst;
}
