/** The roll that reproduces `screenUp` through `imagePlaneBasis`, which rotates
 * the pole into `up(θ) = e2·cosθ − e1·sinθ` about `e1 = normalize(forward ×
 * upRef)`, `e2 = e1 × forward` — so θ is just the two projections. `forward ∥
 * upRef` leaves `e1 ≈ 0` and returns 0, that function's own degeneracy. */

import type { Vec3 } from '../../@types/math/Vec3';
import { normalize3 } from '../math/normalize3';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';

export function rollFromScreenUp(
  forward: Readonly<Vec3>,
  screenUp: Readonly<Vec3>,
  upRef: Readonly<Vec3>,
): number {
  const e1 = normalize3(cross3(forward, upRef));
  const e2 = cross3(e1, forward);
  return Math.atan2(-dot3(screenUp, e1), dot3(screenUp, e2));
}
