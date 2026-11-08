/**
 * pxOfRay — a unit world direction to device px (y down) through a
 * `ViewProjection`: null behind a pinhole (`projectDirToPx`'s cut-off) or
 * below a fisheye's horizon circle. `rayOfPx` inverts it.
 */

import type { ViewProjection } from '../../../@types/camera/projection/ViewProjection';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import { directionToFisheye } from '../../dome/directionToFisheye';
import { rotateByTranspose } from '../../math/rotateByTranspose';
import { projectDirToPx } from './projectDirToPx';

export function pxOfRay(proj: ViewProjection, dir: Readonly<Vec3>): Vec2 | null {
  if (proj.kind === 'rectilinear') {
    const at = projectDirToPx(dir, proj.basis, proj.frustum, proj.size);
    return at && [at.x, at.y];
  }
  const [x, y] = directionToFisheye(rotateByTranspose(proj.basis, dir));
  if (Math.hypot(x, y) > 1) return null;
  const { centrePx: c, radiusPx: r } = proj;
  return [c[0] + x * r, c[1] - y * r];
}
