/**
 * anchoredDragRotation — the 1:1 drag (spec §6a). Both cursor rays meet the
 * FROZEN pick sphere and the whole pose — position and basis — rotates
 * rigidly, so the grabbed point re-projects onto the current pixel exactly.
 * Pole-free: no `cos(latitude)` term exists to be wrong, and dragging over the
 * pole is an ordinary rotation about a near-equatorial axis.
 *
 * `null` ⇒ the caller degrades the gesture (trackball on a miss, strafe in the
 * anchor plane at grazing incidence).
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { raySphereRoots } from '../math/raySphereRoots';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';
import { rotateVec3ByQuat } from '../math/rotateVec3ByQuat';
import { rotateBasisByQuat } from './rotateBasisByQuat';
import { cross3 } from '../math/cross3';

const BODY_CENTRE: Vec3 = [0, 0, 0];

/**
 * |ray·normal| below this is edge-on enough that the rotation satisfying the
 * drag is a teleport. A hard test, never a blend — a blend would be a second
 * path hiding drift. Feel-open until Task 22. Single home: the surface
 * controller imports this, never restates it.
 */
export const MIN_INCIDENCE_COS = 0.05;

/** `dir` must be unit — `raySphereRoots` assumes it and scales `t` by `|dir|`. */
type PickRay = { readonly originM: Readonly<Vec3>; readonly dir: Readonly<Vec3> };

/** Unit direction of the near pick; `null` on a miss, a hit behind the eye, or grazing. */
function pickDir(ray: PickRay, radiusM: number): Vec3 | null {
  const roots = raySphereRoots(ray.originM, ray.dir, BODY_CENTRE, radiusM);
  // Both roots behind the eye is a hit for the quadratic but a miss for a
  // gesture — taking it would grab the far side of the body.
  if (roots === null || roots[0] <= 0) return null;

  const t = roots[0];
  const n: Vec3 = [
    (ray.originM[0] + ray.dir[0] * t) / radiusM,
    (ray.originM[1] + ray.dir[1] * t) / radiusM,
    (ray.originM[2] + ray.dir[2] * t) / radiusM,
  ];
  const incidence = ray.dir[0] * n[0] + ray.dir[1] * n[1] + ray.dir[2] * n[2];
  return Math.abs(incidence) < MIN_INCIDENCE_COS ? null : n;
}

export function anchoredDragRotation(
  pose: BodyFixedPose,
  prevRay: PickRay,
  currRay: PickRay,
  anchorRadiusM: number,
): BodyFixedPose | null {
  const grabbed = pickDir(prevRay, anchorRadiusM);
  const under = pickDir(currRay, anchorRadiusM);
  if (grabbed === null || under === null) return null;

  // The pose rotates WITH its rays, so the rotation that puts the grabbed
  // point under the cursor is the one carrying the current pick BACK onto it.
  const axis = cross3(under, grabbed);
  const sin = Math.hypot(axis[0], axis[1], axis[2]);
  if (sin === 0) return pose;
  const cos = under[0] * grabbed[0] + under[1] * grabbed[1] + under[2] * grabbed[2];
  const q = quatFromAxisAngle([axis[0] / sin, axis[1] / sin, axis[2] / sin], Math.atan2(sin, cos));

  return {
    ...pose,
    anchorLocalM: rotateVec3ByQuat(q, pose.anchorLocalM),
    eyeRelAnchorM: rotateVec3ByQuat(q, pose.eyeRelAnchorM),
    basisLocal: rotateBasisByQuat(q, pose.basisLocal),
  };
}
