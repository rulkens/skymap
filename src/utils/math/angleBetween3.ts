/** angleBetween3 — the angle between two vectors, radians: atan2 of |a×b| over a·b, exact near 0 where acos(dot) is not. */

import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from './cross3';
import { dot3 } from './dot3';

export function angleBetween3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.atan2(Math.hypot(...cross3(a, b)), dot3(a, b));
}
