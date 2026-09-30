import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { rotatedAboutPoint } from './rotatedAboutPoint';
import { multiplyQuat } from '../math/multiplyQuat';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';

/**
 * Orbits the body centre AGAINST the screen-radian motion, which is what
 * carries a grabbed limb along with the cursor. The caller's level settle
 * holds the entry heading, so this is the north-locked orbit, not a free
 * trackball.
 */
export function orbitedSurfacePose(
  arm: BodyFixedPose,
  yawRad: number,
  pitchRad: number,
): BodyFixedPose {
  const b = arm.basisLocal;
  const right: Vec3 = [b[0], b[1], b[2]];
  const up: Vec3 = [b[3], b[4], b[5]];
  const q = multiplyQuat(quatFromAxisAngle(right, -pitchRad), quatFromAxisAngle(up, -yawRad));
  return rotatedAboutPoint(arm, q, BODY_LOCAL_FRAME.centreM);
}
