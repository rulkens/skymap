/**
 * blendCameraPose — `from` toward `to` by `t` (0..1) in orbit-pose terms: pitch linearly, yaw the
 * short way round, distance in log space because a mission re-aim spans metres to AU. The target
 * moves in step with the distance, not with `t`: zooming out it travels once the view is wide,
 * zooming in before it narrows, so it never slides further than the view is across in one step.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import { lerp } from '../math/lerp';
import { lerpAngleShortest } from '../math/lerpAngleShortest';
import { lerpVec3 } from '../math/lerpVec3';

export function blendCameraPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const distance = Math.exp(lerp(Math.log(from.distance), Math.log(to.distance), t));
  const span = to.distance - from.distance;
  // Equal distances leave no zoom to ride, so the target follows `t` itself.
  const along = Math.abs(span) < 1e-6 * to.distance ? t : (distance - from.distance) / span;
  return {
    target: lerpVec3(from.target, to.target, along),
    yaw: lerpAngleShortest(from.yaw, to.yaw, t),
    pitch: lerp(from.pitch, to.pitch, t),
    distance,
  };
}
