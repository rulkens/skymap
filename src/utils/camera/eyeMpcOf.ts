/**
 * eyeMpcOf — the world eye of an orbit pose, Mpc: `target + distance · dir`,
 * where `dir` is the frame-local `(yaw, pitch)` decode rotated by the STEADY
 * `poseBasis` (never `upBasis` — see `OrbitCameraInit.d.ts`).
 *
 * One derivation, two readers: `updatePosition` delegates here, and the regime
 * predicate reads the same eye (spec §4). `poseBasis === undefined` is the
 * identity frame, the convention `rotateVec3ByTightMat3` already carries.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { yawPitchToDir } from './yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';

// Module scratch reused every call so the per-frame path never allocates.
// Two buffers: the matrix–vector product reads all three input components
// while writing its output, so the decode and the rotation cannot share one.
const scratchDir: Vec3 = [0, 0, 0];
const scratchWorld: Vec3 = [0, 0, 0];

/**
 * @param out Optional destination written in place and returned; a fresh `Vec3`
 *            is allocated when omitted (same convention as `yawPitchToDir`).
 */
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
