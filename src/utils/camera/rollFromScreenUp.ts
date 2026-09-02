/**
 * rollFromScreenUp — the roll that reproduces `screenUp` through
 * `imagePlaneBasis`. That function rotates the frame pole about the view axis
 * into `up(θ) = e2·cosθ − e1·sinθ`, with `e1 = normalize(forward × upRef)` and
 * `e2 = e1 × forward` its θ=0 axes (the minus is its sinθ term crossing
 * `upRef × forward`), so θ is just the two projections. `forward ∥ upRef`
 * leaves `e1 ≈ 0` and yields 0 — the same pole-aligned degeneracy
 * `imagePlaneBasis` leaves to its callers.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { normalize3 } from '../math/normalize3';
import { cross3 } from '../math/cross3';

function dot3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function rollFromScreenUp(
  forward: Readonly<Vec3>,
  screenUp: Readonly<Vec3>,
  upRef: Readonly<Vec3>,
): number {
  const e1 = normalize3(cross3(forward, upRef));
  const e2 = cross3(e1, forward);
  return Math.atan2(-dot3(screenUp, e1), dot3(screenUp, e2));
}
