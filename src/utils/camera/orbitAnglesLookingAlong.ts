/**
 * orbitAnglesLookingAlong — invert the orbit-camera convention: given a world
 * direction the camera should AIM along, return the (yaw, pitch) that achieves
 * it.
 *
 * `updatePosition` places the eye at `target + distance · dir`, where
 *
 *     dir = [cos(pitch)·sin(yaw), sin(pitch), cos(pitch)·cos(yaw)]
 *
 * is the unit vector pointing FROM the target TOWARD the eye. The camera looks
 * from the eye back at the target, so its viewing direction — its AIM — is
 * `-dir`. To make the camera look along `forward`, we therefore need
 * `dir = -forward`, and we solve the convention for the angles:
 *
 *     sin(pitch) = dir.y = -forward.y          → pitch = asin(-forward.y)
 *     dir.x = cos(pitch)·sin(yaw) = -forward.x
 *     dir.z = cos(pitch)·cos(yaw) = -forward.z  → yaw   = atan2(-forward.x, -forward.z)
 *
 * (cos(pitch) ≥ 0 over the pitch range, so it drops out of the atan2.) The input
 * is normalised first so callers can pass an un-normalised path tangent.
 *
 * This is the bridge that lets a `flyPath` aim the camera DOWN THE PATH: feed it
 * the spline's forward tangent at a knot and it yields the bearing that looks
 * that way, with the eye trailing behind along the direction of travel.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function orbitAnglesLookingAlong(forward: Vec3): { yaw: number; pitch: number } {
  const m = Math.hypot(forward[0], forward[1], forward[2]) || 1;
  const fx = forward[0] / m;
  const fy = forward[1] / m;
  const fz = forward[2] / m;

  // dir = -forward; pitch from its Y, yaw from its X/Z (cos(pitch) cancels).
  const pitch = Math.asin(Math.max(-1, Math.min(1, -fy)));
  const yaw = Math.atan2(-fx, -fz);
  return { yaw, pitch };
}
