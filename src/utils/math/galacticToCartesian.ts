/**
 * galacticToCartesian — galactic Cartesian unit vector for galactic
 * coordinates (l, b) in degrees.
 *
 *   x = cos(l)·cos(b),  y = sin(l)·cos(b),  z = sin(b)
 *
 * The result is a unit vector (the spherical-to-Cartesian map of a point
 * on the unit sphere), suitable as one column of a frame-rotation matrix.
 */

import type { Vec3 } from '../../@types/math/Vec3';

const RAD = Math.PI / 180;

export function galacticToCartesian(lDeg: number, bDeg: number): Vec3 {
  const l = lDeg * RAD;
  const b = bDeg * RAD;
  return [Math.cos(l) * Math.cos(b), Math.sin(l) * Math.cos(b), Math.sin(b)];
}
