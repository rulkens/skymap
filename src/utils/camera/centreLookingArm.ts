/**
 * centreLookingArm — the disengage normalization (D2, pop-2 fix). Commits
 * target-at-centre, eye preserved: the pivot pin re-reads an absolute `target`
 * as the body's centre one frame later and rebuilds the eye from
 * `target + dir·distance`, so committing the on-ray surface target verbatim
 * teleported the eye one body radius inward (pop-2). Zoom-driven recessions
 * cross at tilt 0, so this is view-exact; other crossings re-aim by at most
 * the remaining tilt on the flip frame.
 */

import type { FramedPose } from '../../@types/camera/FramedPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

import { absoluteArm } from './absoluteArm';
import { orbitAnglesLookingAlong } from './orbitAnglesLookingAlong';
import { normalize3 } from '../math/normalize3';

export function centreLookingArm(
  eyeMpc: Readonly<Vec3>,
  centreMpc: Readonly<Vec3>,
  poseBasis: Readonly<Mat3>,
  roll: number,
): FramedPose<'absolute'> {
  const toCentre: Vec3 = [
    centreMpc[0] - eyeMpc[0],
    centreMpc[1] - eyeMpc[1],
    centreMpc[2] - eyeMpc[2],
  ];
  const { yaw, pitch } = orbitAnglesLookingAlong(normalize3(toCentre), poseBasis);
  return absoluteArm({
    target: [centreMpc[0], centreMpc[1], centreMpc[2]],
    yaw,
    pitch,
    distance: Math.hypot(toCentre[0], toCentre[1], toCentre[2]),
    roll,
  });
}
