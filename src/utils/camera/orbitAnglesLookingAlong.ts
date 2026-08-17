/**
 * orbitAnglesLookingAlong — invert the orbit-camera convention: given a world
 * direction the camera should AIM along, return the (yaw, pitch) that achieves
 * it.
 *
 * `updatePosition` places the eye at `target + distance · dir`, where
 *
 *     dir = frameBasis · [cos(pitch)·sin(yaw), sin(pitch), cos(pitch)·cos(yaw)]
 *
 * is the unit vector pointing FROM the target TOWARD the eye (the bracketed part
 * is the frame-LOCAL decode, `yawPitchToDir`; `frameBasis` rotates it into
 * world). The camera looks from the eye back at the target, so its viewing
 * direction — its AIM — is `-dir`. To make the camera look along `forward`, we
 * need `dir = -forward`, and we solve the convention for the angles.
 *
 * ### No frame (identity)
 *
 * With no `frameBasis` the decode already IS world space, so:
 *
 *     sin(pitch) = dir.y = -forward.y          → pitch = asin(-forward.y)
 *     dir.x = cos(pitch)·sin(yaw) = -forward.x
 *     dir.z = cos(pitch)·cos(yaw) = -forward.z  → yaw   = atan2(-forward.x, -forward.z)
 *
 * (cos(pitch) ≥ 0 over the pitch range, so it drops out of the atan2.)
 *
 * ### Orientation frame
 *
 * This function must be the exact inverse of `updatePosition`'s decode through
 * the SAME basis, or a derived pose (path tangent, foci framing) computed here
 * would not decode back to the world direction it was measured from. Given the
 * decode `dir_world = frameBasis · dir_local`, we recover the frame-LOCAL
 * direction by the inverse rotation. `frameBasis` is a proper rotation
 * (orthonormal), so its inverse is its transpose:
 *
 *     dir_local = frameBasisᵀ · dir_world = frameBasisᵀ · (-forward)
 *
 * then extract pitch from `dir_local.y` and yaw from `dir_local.x / .z` exactly
 * as the identity case does. Passing the steady `frameBasis` here and the same
 * basis to the decode makes the round-trip exact (see the round-trip test).
 *
 * The registry `Mat3` is a TIGHT 9-float column-major tuple (cell at row r,
 * column c is at `basis[c*3 + r]`), mirroring `updatePosition`'s hand-rolled
 * product rather than wgpu-matrix's vec4-padded layout. The transpose product
 * `(Bᵀ·v)[c]` is the dot of B's COLUMN c with `v`: `basis[c*3+0]*v[0] +
 * basis[c*3+1]*v[1] + basis[c*3+2]*v[2]` — three multiply-adds, allocation-free.
 *
 * This is the bridge that lets a `flyPath` aim the camera DOWN THE PATH: feed it
 * the spline's forward tangent at a knot and it yields the bearing that looks
 * that way, with the eye trailing behind along the direction of travel.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { Mat3 } from '../../@types/math/Mat3';

export function orbitAnglesLookingAlong(
  forward: Vec3,
  frameBasis?: Mat3,
): { yaw: number; pitch: number } {
  const m = Math.hypot(forward[0], forward[1], forward[2]) || 1;
  // dir = -forward (normalised): the frame-agnostic world direction from target
  // toward eye. Callers may pass an un-normalised path tangent, so normalise here.
  const dx = -forward[0] / m;
  const dy = -forward[1] / m;
  const dz = -forward[2] / m;

  // Frame-local direction. With no basis the world direction already IS the
  // frame-local one; with a basis, rotate it back by the transpose (each output
  // component is the dot of the matching COLUMN of `frameBasis` with `dir`).
  let lx = dx;
  let ly = dy;
  let lz = dz;
  if (frameBasis !== undefined) {
    lx = frameBasis[0] * dx + frameBasis[1] * dy + frameBasis[2] * dz;
    ly = frameBasis[3] * dx + frameBasis[4] * dy + frameBasis[5] * dz;
    lz = frameBasis[6] * dx + frameBasis[7] * dy + frameBasis[8] * dz;
  }

  // pitch from the local Y, yaw from the local X/Z (cos(pitch) cancels).
  const pitch = Math.asin(Math.max(-1, Math.min(1, ly)));
  const yaw = Math.atan2(lx, lz);
  return { yaw, pitch };
}
