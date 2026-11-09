/**
 * projectTangentLattice — a sprite's lattice in screen px: its (GRID + 1)² corners
 * carried by a similarity onto the tangent plane about `centre` (azimuthal
 * equidistant, east and north as x and y, radians), put back on the sphere and
 * projected through the view, so the view's own stretch bends the sprite as it
 * does the stars. A corner behind a pinhole or below a fisheye horizon is pulled along
 * the sphere toward a visible one until it just projects, so the figure keeps drawing
 * as far as it is in view; null only when no corner is.
 */

import type { ViewProjection } from '../../../@types/camera/projection/ViewProjection';
import type { Similarity2D } from '../../../@types/math/Similarity2D';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import { ANTIQUE_ORNAMENT_GRID } from '../../../data/rendering/antiqueLook';
import { normalize3 } from '../../math/normalize3';
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
  const dirs: Vec3[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const sx = i / n - 0.5;
      const y = (j / n - 0.5) * aspect;
      const x = fit.mirrored ? -sx : sx;
      const qx = c * x - s * y + fit.t[0];
      const qy = s * x + c * y + fit.t[1];
      const rho = Math.hypot(qx, qy);
      const along = rho > 0 ? Math.sin(rho) / rho : 1;
      dirs.push(
        centre.map(
          (ci, a) => ci * Math.cos(rho) + (qx * east[a]! + qy * north[a]!) * along,
        ) as Vec3,
      );
    }
  const px = dirs.map((d) => pxOfRay(projection, d));
  const seen = dirs.find((_, k) => px[k] !== null);
  if (seen === undefined) return null;
  return px.map((p, k) => p ?? atHorizon(projection, dirs[k]!, seen)!);
}

/** The point on the arc from a hidden direction to a visible one where it first projects. */
function atHorizon(projection: ViewProjection, hidden: Vec3, seen: Vec3): Vec2 | null {
  let [lo, hi] = [0, 1];
  const toward = (t: number) => normalize3(hidden.map((h, a) => h + (seen[a]! - h) * t) as Vec3);
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) / 2;
    if (pxOfRay(projection, toward(mid)) === null) lo = mid;
    else hi = mid;
  }
  return pxOfRay(projection, toward(hi));
}
