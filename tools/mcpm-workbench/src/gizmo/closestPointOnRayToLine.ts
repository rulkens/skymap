import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Ray } from '../../@types/Ray';

/**
 * closestPointOnRayToLine — the classic skew-line closest-point solve
 * (Ericson, *Real-Time Collision Detection* §5.1.9), specialised to two
 * unit directions so `a = dot(d1,d1)` and `e = dot(d2,d2)` drop to 1:
 * with `r = ray.origin − lineOrigin`, `b = dot(d1,d2)`, `denom = 1 − b²`,
 * the line parameter is `t = (dot(d2,r) − b·dot(d1,r)) / denom`.
 * `denom → 0` (ray parallel to the line) leaves `t` underdetermined; that
 * case doesn't arise for gizmo handles, so this returns 0 rather than NaN.
 */
export function closestPointOnRayToLine(
  ray: Ray,
  lineOrigin: Readonly<Vec3>,
  lineDir: Readonly<Vec3>,
): number {
  const rx = ray.origin[0] - lineOrigin[0];
  const ry = ray.origin[1] - lineOrigin[1];
  const rz = ray.origin[2] - lineOrigin[2];

  const d1 = ray.dir;
  const d2 = lineDir;
  const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
  const dotD1r = d1[0] * rx + d1[1] * ry + d1[2] * rz;
  const dotD2r = d2[0] * rx + d2[1] * ry + d2[2] * rz;

  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-9) return 0;

  return (dotD2r - b * dotD1r) / denom;
}
