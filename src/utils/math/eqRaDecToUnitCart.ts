/**
 * eqRaDecToUnitCart — equatorial Cartesian *unit* vector for equatorial
 * coordinates (RA, Dec) in degrees.
 *
 *   x = cos(RA)·cos(Dec),  y = sin(RA)·cos(Dec),  z = sin(Dec)
 *
 * This is the direction-only map (no distance): the output always lies on
 * the unit sphere, which is what frame-rotation columns and great-circle
 * geometry want.  It is deliberately distinct from `raDecDistToCartesian`,
 * which scales the same direction by a distance — do not conflate them.
 */

import type { Vec3 } from '../../@types/math/Vec3';

const RAD = Math.PI / 180;

export function eqRaDecToUnitCart(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  return [Math.cos(a) * Math.cos(d), Math.sin(a) * Math.cos(d), Math.sin(d)];
}
