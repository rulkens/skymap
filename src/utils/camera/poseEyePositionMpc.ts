/**
 * poseEyePositionMpc — the world-space eye position a raw `CameraPose` would
 * produce, without needing a full `OrbitCamera`.
 *
 * `updatePosition` derives the same quantity, but only onto an `OrbitCamera`'s
 * `position` field — sites that hold just the driver-produced `CameraPose`
 * (`runFrame`, ahead of `deriveFrameContext` assembling `ctx.cam`) would have
 * to fake the camera's unrelated projection fields to reuse it. This is the
 * same `dir(yaw, pitch) → world → target + distance·dir` decode, pulled out
 * as a pure function of exactly the fields such a caller has in hand — the
 * same composition `buildPathTrack.ts` uses for its own pose-only reads.
 */

import { yawPitchToDir } from './yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function poseEyePositionMpc(
  pose: Readonly<CameraPose>,
  poseBasis: Readonly<Mat3> | undefined,
): Vec3 {
  const dir = rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), poseBasis);
  return [
    pose.target[0] + pose.distance * dir[0],
    pose.target[1] + pose.distance * dir[1],
    pose.target[2] + pose.distance * dir[2],
  ];
}
