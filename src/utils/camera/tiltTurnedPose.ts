import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { turnedPose } from './turnedPose';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';

/**
 * The pose tilted by `dTiltRad` (+ raises the view toward the horizon) about
 * the east of forward's own heading — `forward × up̂`, the axis the tilt
 * handle drags about, so heading and roll are untouched. The one tilt
 * geometry the zoom settle turns by. At exact nadir the axis
 * vanishes: a raising turn tips about screen-right (the lerp-in toward a
 * remembered tilt); anything else returns the pose BY REFERENCE, which the
 * full-pose byte bars pin.
 */
export function tiltTurnedPose(
  pose: BodyFixedPose,
  dTiltRad: number,
  pivotM: Readonly<Vec3> | null,
): BodyFixedPose {
  if (dTiltRad === 0) return pose;
  const b = pose.basisLocal;
  const axisRaw = cross3([b[6], b[7], b[8]], normalize3(bodyFixedEyeM(pose)));
  const axisLen = Math.hypot(...axisRaw);
  const axis: Vec3 | null =
    axisLen > 1e-12
      ? [axisRaw[0] / axisLen, axisRaw[1] / axisLen, axisRaw[2] / axisLen]
      : dTiltRad > 0
        ? [b[0], b[1], b[2]]
        : null;
  if (axis === null) return pose;
  return turnedPose(pose, quatFromAxisAngle(axis, dTiltRad), pivotM);
}
