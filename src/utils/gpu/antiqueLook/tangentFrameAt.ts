/**
 * tangentFrameAt — celestial east and north at a unit world direction, the axes
 * of the tangent plane a sprite is laid on. East is arbitrary at a pole.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { cross3 } from '../../math/cross3';
import { normalize3 } from '../../math/normalize3';

export function tangentFrameAt(centre: Readonly<Vec3>): { east: Vec3; north: Vec3 } {
  let east = cross3([0, 0, 1], centre);
  if (Math.hypot(...east) < 1e-6) east = cross3([0, 1, 0], centre);
  east = normalize3(east);
  return { east, north: cross3(centre, east) };
}
