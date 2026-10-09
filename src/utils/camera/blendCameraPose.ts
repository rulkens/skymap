/**
 * blendCameraPose — `from` toward `to` by `t` (0..1) in orbit-pose terms: target and pitch
 * linearly, yaw the short way round, distance in log space because a mission re-aim spans
 * metres to AU and a linear blend would spend its whole length near the far end.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import { lerp } from '../math/lerp';
import { lerpAngleShortest } from '../math/lerpAngleShortest';
import { lerpVec3 } from '../math/lerpVec3';

export function blendCameraPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  return {
    target: lerpVec3(from.target, to.target, t),
    yaw: lerpAngleShortest(from.yaw, to.yaw, t),
    pitch: lerp(from.pitch, to.pitch, t),
    distance: Math.exp(lerp(Math.log(from.distance), Math.log(to.distance), t)),
  };
}
