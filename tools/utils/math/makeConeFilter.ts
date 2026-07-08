/**
 * makeConeFilter — build an angular cone membership predicate by hoisting
 * trig costs. The factory precomputes the center unit vector and cos(radius)
 * once; the returned predicate is a fast dot-product comparison.
 *
 * Great-circle distance between two unit vectors u and v is arccos(dot(u, v)).
 * To ask "is the angle from center to query < radius?", we compare the dot
 * product to cos(radius): if dot(unitVec(ra, dec), centerVec) > cos(radius),
 * then the angular separation is < radius.  This avoids per-call acos, sqrt,
 * and sin/cos trig — a factory's precomputation cost (once) vs. predicate cost
 * (millions of catalog rows).
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { eqRaDecToUnitCart } from '../../../src/utils/math/eqRaDecToUnitCart';

const RAD = Math.PI / 180;

export function makeConeFilter(
  centerRaDeg: number,
  centerDecDeg: number,
  radiusDeg: number,
): (raDeg: number, decDeg: number) => boolean {
  // Precompute the center unit vector and cos(radius) once.
  const centerVec: Readonly<Vec3> = eqRaDecToUnitCart(
    centerRaDeg,
    centerDecDeg,
  );
  const cosRadius = Math.cos(radiusDeg * RAD);

  // Return the predicate: fast dot-product comparison per query.
  return (raDeg: number, decDeg: number): boolean => {
    const queryVec = eqRaDecToUnitCart(raDeg, decDeg);
    // Dot product of two 3D vectors: x1*x2 + y1*y2 + z1*z2.
    const dot =
      centerVec[0] * queryVec[0] +
      centerVec[1] * queryVec[1] +
      centerVec[2] * queryVec[2];
    // If dot > cos(radius), then the angular separation is < radius.
    return dot > cosRadius;
  };
}
