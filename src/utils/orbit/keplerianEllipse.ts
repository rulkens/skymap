/**
 * keplerianEllipse — turn a body's classical orbital elements into the three
 * CONSTANT world vectors that describe its orbit as an affine image of the unit
 * circle (spec §3.1).
 *
 * ### The one structural fact this rests on
 *
 * A bound Keplerian orbit, evaluated at eccentric anomaly `E`, is
 *
 *     X(E) = C + A·cos E + B·sin E
 *
 * with `A`, `B`, `C` fixed once the elements (and parent position) are fixed.
 * So in the plane basis `(A, B)` about the centre `C`, the orbit is exactly the
 * **unit circle** `s² + t² = 1`, and the plane angle IS the eccentric anomaly.
 * All of the real orbit geometry — eccentricity, inclination, node, periapsis —
 * lives in these three vectors; the curve itself is always the unit circle. The
 * whole trail feature (CPU position seeding + the screen-space conic fragment)
 * rides on this: derive `A`, `B`, `C` once, and both the body and its trail are
 * points/curves of the same affine map. (A perfect circle ring is the special
 * case `A ⟂ B`, `|A| = |B|`, `C` at the focus; ellipses relax all three.)
 *
 * ### Why focus-relative (centre-OFFSET, not absolute centre)
 *
 * This returns `centerOffsetMpc = C − focus`, the vector from the orbit's focus
 * to its geometric centre, NOT the absolute-world centre. Adding the focus is
 * left to the caller (Task 7) so the same math serves BOTH a heliocentric orbit
 * (focus = the Sun at the origin) and a geocentric one (the Moon, focus =
 * Earth's derived world position). Baking a specific focus in here would fork
 * the function per parent; keeping it focus-relative keeps it one pure map from
 * elements to shape.
 *
 * ### The rotations
 *
 * Orientation comes from `perifocalAxesWorld` — `P̂w` (toward periapsis) and
 * `Q̂w` (90° prograde), already in equatorial world. All that is left here is
 * the ellipse's own size, with `b = a·√(1 − e²)`:
 *
 *     A     = a · P̂w            (semi-major, toward periapsis)
 *     B     = b · Q̂w            (semi-minor, prograde)
 *     C_off = −a·e · P̂w         (focus → ellipse centre)
 *
 * @param elements  The body's J2000 classical elements (a, e, i, Ω, ω, …).
 * @returns The three constant equatorial-world vectors of the ellipse, with the
 *          focus at the origin — the caller adds the parent's world position.
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
