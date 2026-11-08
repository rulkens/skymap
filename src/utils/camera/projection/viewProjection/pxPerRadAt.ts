/**
 * pxPerRadAt — device px per radian of a small turn at a unit world direction
 * in front of the view, taken across the line from the view's axis through it
 * (the tangential scale): what sizes a sprite set there. A pinhole stretches it
 * by 1 / cos of the off-axis angle; an equidistant fisheye by θ / sin θ from
 * the zenith.
 */

import type { ViewProjection } from '../../../../@types/camera/projection/ViewProjection';
import type { Vec3 } from '../../../../@types/math/Vec3';

export function pxPerRadAt(proj: ViewProjection, dir: Readonly<Vec3>): number {
  if (proj.kind === 'rectilinear') {
    const { basis, frustum, size } = proj;
    const z = dir[0] * basis.forward[0] + dir[1] * basis.forward[1] + dir[2] * basis.forward[2];
    return size.height / (frustum.tanUp - frustum.tanDown) / z;
  }
  const m = proj.basis;
  const theta = Math.acos(Math.max(-1, Math.min(1, dir[0] * m[3] + dir[1] * m[4] + dir[2] * m[5])));
  const pxPerRad = proj.radiusPx / (Math.PI / 2);
  return theta < 1e-6 ? pxPerRad : (pxPerRad * theta) / Math.sin(theta);
}
