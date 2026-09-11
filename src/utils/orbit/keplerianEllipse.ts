/**
 * keplerianEllipse — a body's classical elements → the three CONSTANT world
 * vectors that make its orbit an affine image of the unit circle (spec §3.1).
 *
 * `X(E) = C + A·cos E + B·sin E`, with `A`, `B`, `C` fixed once the elements
 * are: in the basis `(A, B)` about `C` the curve is exactly the unit circle and
 * the plane angle IS the eccentric anomaly, so all of e/i/Ω/ω lives in the three
 * vectors. Position and trail are points of that same map, which is what makes
 * a body sitting on its own trail structural, not a sync invariant.
 *
 *     A     = a · P̂w            (semi-major, toward periapsis)
 *     B     = b · Q̂w            (semi-minor, prograde; b = a·√(1 − e²))
 *     C_off = −a·e · P̂w         (focus → centre, focus-RELATIVE so one map
 *                                serves a heliocentric planet and the Moon)
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../@types/math/Vec3';
import { perifocalAxesWorld } from './perifocalAxesWorld';

export function keplerianEllipse(elements: OrbitalElements): {
  centerOffsetMpc: Vec3;
  semiMajorMpc: Vec3;
  semiMinorMpc: Vec3;
} {
  const a = elements.semiMajorMpc;
  const e = elements.eccentricity;
  const { pWorld, qWorld } = perifocalAxesWorld(elements);

  const b = a * Math.sqrt(1 - e * e);
  const aE = a * e;

  return {
    semiMajorMpc: [a * pWorld[0], a * pWorld[1], a * pWorld[2]],
    semiMinorMpc: [b * qWorld[0], b * qWorld[1], b * qWorld[2]],
    centerOffsetMpc: [-aE * pWorld[0], -aE * pWorld[1], -aE * pWorld[2]],
  };
}
