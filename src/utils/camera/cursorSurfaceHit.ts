/**
 * cursorSurfaceHit — the body-local lon/lat where a cursor ray meets a
 * body's surface, or `null` on a miss.
 *
 * `tNear` (the smaller root) is the front-facing crossing — the camera
 * always sits outside the body in this app, so it is the visible surface
 * point. `tNear < 0` (camera inside the sphere) is defensive: should never
 * happen, but a hit "behind" the eye is not a cursor hit either. The hit
 * point is carried into the body's LOCAL frame via `bodyOrientation`'s
 * transpose — the same convention `camPosLocal.ts` derives (`orientation`'s
 * columns are local axes in world space, so a world vector needs the
 * transpose to land in local space).
 */

import { raySphereRoots } from '../math/raySphereRoots';
import { directionToLonLatDeg } from '../scene/directionToLonLatDeg';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Mat3 } from '../../@types/math/Mat3';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';

export function cursorSurfaceHit(
  ray: { readonly origin: Readonly<Vec3>; readonly direction: Readonly<Vec3> },
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  bodyOrientation: Readonly<Mat3>,
): LonLatDeg | null {
  const roots = raySphereRoots(ray.origin, ray.direction, bodyCentreMpc, radiusMpc);
  if (roots === null) return null;

  const tNear = roots[0];
  if (tNear < 0) return null;

  const hx = ray.origin[0] + tNear * ray.direction[0] - bodyCentreMpc[0];
  const hy = ray.origin[1] + tNear * ray.direction[1] - bodyCentreMpc[1];
  const hz = ray.origin[2] + tNear * ray.direction[2] - bodyCentreMpc[2];

  // Rᵀ · offset: local axis i = dot(offset, column i of the orientation).
  const m = bodyOrientation;
  const lx = m[0] * hx + m[1] * hy + m[2] * hz;
  const ly = m[3] * hx + m[4] * hy + m[5] * hz;
  const lz = m[6] * hx + m[7] * hy + m[8] * hz;
  const len = Math.hypot(lx, ly, lz) || 1;

  return directionToLonLatDeg([lx / len, ly / len, lz / len]);
}
