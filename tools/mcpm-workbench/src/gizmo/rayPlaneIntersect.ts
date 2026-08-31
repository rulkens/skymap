import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Ray } from '../../@types/Ray';

/**
 * rayPlaneIntersect — `t = dot(planePoint − ray.origin, planeNormal) /
 * dot(ray.dir, planeNormal)`; `null` when the denominator is ~0 (ray
 * parallel to the plane, including lying in it) rather than returning an
 * infinite or NaN point.
 */
export function rayPlaneIntersect(
  ray: Ray,
  planePoint: Readonly<Vec3>,
  planeNormal: Readonly<Vec3>,
): Vec3 | null {
  const denom =
    ray.dir[0] * planeNormal[0] + ray.dir[1] * planeNormal[1] + ray.dir[2] * planeNormal[2];
  if (Math.abs(denom) < 1e-9) return null;

  const px = planePoint[0] - ray.origin[0];
  const py = planePoint[1] - ray.origin[1];
  const pz = planePoint[2] - ray.origin[2];
  const numer = px * planeNormal[0] + py * planeNormal[1] + pz * planeNormal[2];
  const t = numer / denom;

  return [
    ray.origin[0] + ray.dir[0] * t,
    ray.origin[1] + ray.dir[1] * t,
    ray.origin[2] + ray.dir[2] * t,
  ];
}
