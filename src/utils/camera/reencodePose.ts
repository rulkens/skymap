/**
 * reencodePose — re-express a `CameraPose`'s (yaw, pitch) from one
 * orientation frame's basis to another's, keeping the world-space eye
 * direction fixed. Composes `yawPitchToDir` (decode under `from`) with
 * `orbitAnglesLookingAlong` (re-encode under `to`); no new math.
 *
 * Landmine: `orbitAnglesLookingAlong` takes the camera's AIM direction, the
 * NEGATION of the target→eye direction `yawPitchToDir` decodes — the sign
 * flips once here, at the seam between the two conventions.
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

  return {
    // Fresh target copy — the identity branch above returns the caller's own
    // object, but this branch constructs a NEW pose that must own its array.
    target: [pose.target[0], pose.target[1], pose.target[2]],
    yaw,
    pitch,
    distance: pose.distance,
    roll: pose.roll,
  };
}
