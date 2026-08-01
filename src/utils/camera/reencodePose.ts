/**
 * reencodePose — re-express a `CameraPose`'s yaw/pitch from one orientation
 * frame's basis to another's, keeping the world-space eye direction fixed.
 *
 * A pose's (yaw, pitch) are frame-LOCAL angles (`yawPitchToDir`'s domain);
 * switching the active orientation frame must change how they're READ, never
 * where the camera actually points. This composes the two existing halves:
 * decode under `from` to a world target→eye direction, then re-encode that
 * SAME world direction under `to`. `target` and `distance` carry no frame
 * dependence and pass through untouched.
 *
 * `orbitAnglesLookingAlong` takes the direction the camera AIMS along — the
 * NEGATION of the target→eye direction `yawPitchToDir` decodes. The sign flip
 * happens once here, at the seam between the two conventions.
 *
 * @param pose  Source pose, its angles read under `from`.
 * @param from  Source frame's basis, or `undefined` for the identity frame.
 * @param to    Destination frame's basis, or `undefined` for the identity frame.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { yawPitchToDir } from './yawPitchToDir';
import { orbitAnglesLookingAlong } from './orbitAnglesLookingAlong';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';

export function reencodePose(
  pose: CameraPose,
  from: Mat3 | undefined,
  to: Mat3 | undefined,
): CameraPose {
  // Identity case dominates call volume (most frame switches don't touch every
  // in-flight pose); returning by reference here keeps it allocation-free.
  if (from === to) return pose;

  const local = yawPitchToDir(pose.yaw, pose.pitch);
  const world = rotateVec3ByTightMat3(local, from, local); // reuse `local`'s scratch
  const aim: Vec3 = [-world[0], -world[1], -world[2]];
  const { yaw, pitch } = orbitAnglesLookingAlong(aim, to);

  return { target: pose.target, yaw, pitch, distance: pose.distance };
}
