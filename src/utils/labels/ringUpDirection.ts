/**
 * ringUpDirection — the "up" a label lifts along to reach the top of an eye-facing ring.
 *
 * The ring's plane is perpendicular to the sight line to its centre, not to the camera's
 * view axis, so screen-up only lies in that plane on the view axis. Off-axis it dips into
 * the ring; removing its sight-line component puts the lift back in the plane.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';

/** Below this the screen-up is (anti)parallel to the sight line and has no in-plane part. */
const MIN_IN_PLANE_LENGTH = 1e-6;

export function ringUpDirection(screenUp: Readonly<Vec3>, toCentre: Readonly<Vec3>): Vec3 {
  const sight = normalize3(toCentre);
  const along = dot3(screenUp, sight);
  const inPlane: Vec3 = [
    screenUp[0] - sight[0] * along,
    screenUp[1] - sight[1] * along,
    screenUp[2] - sight[2] * along,
  ];
  return Math.hypot(inPlane[0], inPlane[1], inPlane[2]) < MIN_IN_PLANE_LENGTH
    ? [screenUp[0], screenUp[1], screenUp[2]]
    : normalize3(inPlane);
}
