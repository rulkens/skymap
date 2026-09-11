/**
 * tiltOfPose — angle between an explicit world pose's view axis and `body`'s
 * nadir at `eye` (0 = looking straight down, π/2 = the horizon). The pure
 * core `tiltOverBody` reads off the displayed pose; the register-loop
 * fixtures call this directly against the AUTHORED (pre-projection) pose.
 */

import { normalize3 } from '../../../src/utils/math/normalize3';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function tiltOfPose(pose: CameraPose, eye: Readonly<Vec3>, body: BodyState): number {
  const n = normalize3([
    eye[0] - body.positionMpc[0]!,
    eye[1] - body.positionMpc[1]!,
    eye[2] - body.positionMpc[2]!,
  ] as Vec3);
  const forward = normalize3([
    pose.target[0]! - eye[0],
    pose.target[1]! - eye[1],
    pose.target[2]! - eye[2],
  ] as Vec3);
  const vert = forward[0] * n[0] + forward[1] * n[1] + forward[2] * n[2];
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}
