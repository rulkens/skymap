/**
 * projectFigureGrid — a constellation figure's sprite lattice in screen px: the
 * sprite fitted to its anchor stars on the tangent plane about their mean
 * direction (azimuthal equidistant, so a 90° Hydra still fits), then projected.
 * The fit depends on the stars alone; only the projection follows the camera.
 */

import type { ViewProjection } from '../../../@types/camera/projection/ViewProjection';
import type { AntiqueFigureAnchor } from '../../../@types/rendering/AntiqueFigureAnchor';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import { dot3 } from '../../math/dot3';
import { fitSimilarity2D } from '../../math/fitSimilarity2D';
import { normalize3 } from '../../math/normalize3';
import { raDecDistToCartesian } from '../../math/raDecDistToCartesian';
import { projectTangentLattice } from './projectTangentLattice';
import { tangentFrameAt } from './tangentFrameAt';

export function projectFigureGrid(
  stars: readonly AntiqueFigureAnchor[],
  aspect: number,
  projection: ViewProjection,
): Vec2[] | null {
  const dirs = stars.map((s) => raDecDistToCartesian(s.raDeg, s.decDeg, 1));
  const centre = normalize3(
    dirs.reduce<Vec3>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]),
  );
  const { east, north } = tangentFrameAt(centre);
  const tangent = dirs.map((d): Vec2 => {
    const angle = Math.acos(Math.min(1, dot3(d, centre)));
    const x = dot3(d, east);
    const y = dot3(d, north);
    const k = angle / (Math.hypot(x, y) || 1);
    return [x * k, y * k];
  });
  const fit = fitSimilarity2D(
    stars.map((s): Vec2 => [s.u - 0.5, (s.v - 0.5) * aspect]),
    tangent,
  );
  return projectTangentLattice({ centre, east, north }, fit, aspect, projection);
}
