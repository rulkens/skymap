/**
 * projectTangentLattice — a sprite's lattice in screen px: its (GRID + 1)² corners
 * carried by a similarity onto the tangent plane about `centre` (azimuthal
 * equidistant, east and north as x and y, radians), put back on the sphere and
 * projected through the view, so the view's own stretch bends the sprite as it
 * does the stars. Null when any corner lies behind a pinhole or below a fisheye horizon.
 */

import type { ViewProjection } from '../../../@types/camera/projection/ViewProjection';
import type { Similarity2D } from '../../../@types/math/Similarity2D';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import { ANTIQUE_ORNAMENT_GRID } from '../../../data/rendering/antiqueLook';
import { pxOfRay } from '../../camera/projection/viewProjection/pxOfRay';

export function projectTangentLattice(
  frame: { readonly centre: Vec3; readonly east: Vec3; readonly north: Vec3 },
  fit: Pick<Similarity2D, 'scale' | 'theta' | 'mirrored' | 't'>,
  aspect: number,
  projection: ViewProjection,
): Vec2[] | null {
  const { centre, east, north } = frame;
  const c = Math.cos(fit.theta) * fit.scale;
  const s = Math.sin(fit.theta) * fit.scale;
  const n = ANTIQUE_ORNAMENT_GRID;
  const lattice: Vec2[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const sx = i / n - 0.5;
      const y = (j / n - 0.5) * aspect;
      const x = fit.mirrored ? -sx : sx;
      const qx = c * x - s * y + fit.t[0];
      const qy = s * x + c * y + fit.t[1];
      const rho = Math.hypot(qx, qy);
      const along = rho > 0 ? Math.sin(rho) / rho : 1;
      const dir = centre.map(
        (ci, a) => ci * Math.cos(rho) + (qx * east[a]! + qy * north[a]!) * along,
      ) as Vec3;
      const px = pxOfRay(projection, dir);
      if (px === null) return null;
      lattice.push(px);
    }
  return lattice;
}
