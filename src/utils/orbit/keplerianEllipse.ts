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
 * The perifocal→ecliptic rotation is `R = Rz(Ω)·Rx(i)·Rz(ω)`; its first two
 * columns are the unit perifocal axes in ecliptic coordinates — `P̂` (toward
 * periapsis) and `Q̂` (90° ahead in the orbit plane). Those are then mapped
 * ecliptic→equatorial through `ECLIPTIC_BASIS` (the equinox line +x is shared by
 * both planes; the other two axes rotate by the obliquity). With
 * `b = a·√(1 − e²)`:
 *
 *     A     = a · P̂w            (semi-major, toward periapsis)
 *     B     = b · Q̂w            (semi-minor, prograde)
 *     C_off = −a·e · P̂w         (focus → ellipse centre)
 *
 * Plain scalar arithmetic on the six rotation-matrix entries we actually need is
 * clearer and cheaper than assembling two 3×3 matrices and multiplying — this is
 * a static, once-per-orbit derivation, not a hot path, and the closed forms for
 * `P̂`/`Q̂` are standard.
 *
 * @param elements  The body's J2000 classical elements (a, e, i, Ω, ω, …).
 * @returns The three constant equatorial-world vectors of the ellipse, with the
 *          focus at the origin — the caller adds the parent's world position.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../@types/math/Vec3';
import { ECLIPTIC_BASIS } from '../../data/bodies/eclipticBasis';

/**
 * Map a vector's ecliptic components to the scene's equatorial frame:
 * `vx·[1,0,0] + vy·yAxis + vz·normal`. The equinox line +x is shared, so its
 * component passes through untouched; y and z rotate by the obliquity.
 */
function eclipticToEquatorial(vx: number, vy: number, vz: number): Vec3 {
  const { yAxis, normal } = ECLIPTIC_BASIS;
  return [
    vx + vy * yAxis[0] + vz * normal[0],
    vy * yAxis[1] + vz * normal[1],
    vy * yAxis[2] + vz * normal[2],
  ];
}

export function keplerianEllipse(elements: OrbitalElements): {
  centerOffsetMpc: Vec3;
  semiMajorMpc: Vec3;
  semiMinorMpc: Vec3;
} {
  const a = elements.semiMajorMpc;
  const e = elements.eccentricity;
  const cosI = Math.cos(elements.inclinationRad);
  const sinI = Math.sin(elements.inclinationRad);
  const cosO = Math.cos(elements.ascendingNodeRad);
  const sinO = Math.sin(elements.ascendingNodeRad);
  const cosW = Math.cos(elements.argPeriapsisRad);
  const sinW = Math.sin(elements.argPeriapsisRad);

  // Columns of R = Rz(Ω)·Rx(i)·Rz(ω), in ecliptic coordinates.
  // P̂ — the periapsis direction.
  const px = cosO * cosW - sinO * cosI * sinW;
  const py = sinO * cosW + cosO * cosI * sinW;
  const pz = sinI * sinW;
  // Q̂ — 90° ahead of periapsis in the orbit plane (prograde).
  const qx = -cosO * sinW - sinO * cosI * cosW;
  const qy = -sinO * sinW + cosO * cosI * cosW;
  const qz = sinI * cosW;

  const pWorld = eclipticToEquatorial(px, py, pz);
  const qWorld = eclipticToEquatorial(qx, qy, qz);

  const b = a * Math.sqrt(1 - e * e);
  const aE = a * e;

  return {
    semiMajorMpc: [a * pWorld[0], a * pWorld[1], a * pWorld[2]],
    semiMinorMpc: [b * qWorld[0], b * qWorld[1], b * qWorld[2]],
    centerOffsetMpc: [-aE * pWorld[0], -aE * pWorld[1], -aE * pWorld[2]],
  };
}
