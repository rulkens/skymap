import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Ray } from '../../@types/Ray';
import { cross3 } from '../../../../src/utils/math/cross3';
import { rayPlaneIntersect } from './rayPlaneIntersect';

/**
 * dragRotate — absolute angle (radians, `atan2` range) of the ray's pick point around the ring:
 * intersect the ray with the ring's own plane (`rayPlaneIntersect`, through `centerMpc`, normal
 * `axisDir`), then measure that in-plane point against the plane's own 2D basis —
 * `referenceDir` as the 0° axis, `axisDir × referenceDir` as the 90° axis (right-handed about
 * `axisDir`). `null` when the ray is parallel to the plane (`rayPlaneIntersect`'s own null case)
 * — Viewport's contract is to skip that pointer-move rather than snap to an undefined angle.
 * `referenceDir`'s specific choice is otherwise inert: Viewport calls this with the SAME
 * (axisDir, referenceDir) pair at drag-anchor and every subsequent move, so a constant angle
 * offset from a different reference would cancel out of `angle_now − angle_anchor` regardless.
 */
export function dragRotate(
  ray: Ray,
  centerMpc: Readonly<Vec3>,
  axisDir: Readonly<Vec3>,
  referenceDir: Readonly<Vec3>,
): number | null {
  const hit = rayPlaneIntersect(ray, centerMpc, axisDir);
  if (!hit) return null;

  const offset: Vec3 = [hit[0] - centerMpc[0], hit[1] - centerMpc[1], hit[2] - centerMpc[2]];
  const perp = cross3(axisDir, referenceDir);

  const x = offset[0] * referenceDir[0] + offset[1] * referenceDir[1] + offset[2] * referenceDir[2];
  const y = offset[0] * perp[0] + offset[1] * perp[1] + offset[2] * perp[2];

  return Math.atan2(y, x);
}
