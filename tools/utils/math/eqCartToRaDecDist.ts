/**
 * Equatorial Cartesian → (RA hours, Dec deg, distance Mpc).
 *
 * RA is wrapped into [0, 360) before converting to hours, so a vector in
 * the −y half-plane reports a positive RA rather than a negative one.
 */
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function eqCartToRaDecDist(eq: Vec3): {
  raHours: number;
  decDeg: number;
  distMpc: number;
} {
  const d = Math.hypot(eq[0], eq[1], eq[2]);
  const decDeg = (Math.asin(eq[2] / d) * 180) / Math.PI;
  let raDeg = (Math.atan2(eq[1], eq[0]) * 180) / Math.PI;
  if (raDeg < 0) raDeg += 360;
  return { raHours: raDeg / 15, decDeg, distMpc: d };
}
