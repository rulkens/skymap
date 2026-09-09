/**
 * tiltOverBody — angle between the displayed view axis and `body`'s nadir
 * (0 = looking straight down, π/2 = looking at the horizon). The pure
 * measurement every tilt-mapping fixture pins its assertions on.
 */

import { displayedEye } from './displayedEye';
import { liveWorldPose } from '../../../src/services/engine/helpers/liveWorldPose';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function tiltOverBody(state: EngineState, body: BodyState): number {
  const live = liveWorldPose(state);
  const eye = displayedEye(state);
  const n = normalize3([
    eye[0] - body.positionMpc[0]!,
    eye[1] - body.positionMpc[1]!,
    eye[2] - body.positionMpc[2]!,
  ] as Vec3);
  const forward = normalize3([
    live.target[0]! - eye[0],
    live.target[1]! - eye[1],
    live.target[2]! - eye[2],
  ] as Vec3);
  const vert = forward[0] * n[0] + forward[1] * n[1] + forward[2] * n[2];
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}
