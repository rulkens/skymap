/**
 * OrbitConic — one body's orbit trail as an absolute-world ellipse, the shape
 * the screen-space conic fragment consumes (spec §5).
 *
 * A bound Keplerian orbit is the affine image of the unit circle:
 *
 *     X(E) = centerMpc + semiMajorMpc·cos E + semiMinorMpc·sin E
 *
 * so in the plane basis `(semiMajorMpc, semiMinorMpc)` about `centerMpc` the
 * curve is exactly `s² + t² = 1` and the plane angle IS the eccentric anomaly.
 * Everything the fragment needs to draw the trail — and to place the body's own
 * brightness lobe on it — lives in these vectors plus `eccentricity` (for the
 * `E → M` mapping) and `meanAnomalyRad` (the body's own angle at the epoch).
 *
 * Unlike `OrbitalElements` (focus-relative element table, upstream) and
 * `keplerianEllipse` (focus-relative shape), this type is ABSOLUTE-world:
 * `centerMpc` already has the parent's world position folded in, so the layer
 * reads it without any further resolution.
 */

import type { Vec3 } from '../math/Vec3';

export type OrbitConic = {
  /** Stable identifier, matching the body/element id (e.g. `'moon'`). */
  readonly id: string;
  /** Ellipse centre C in absolute world (parent focus + centre-offset), Mpc. */
  readonly centerMpc: Vec3;
  /** Semi-major axis A = a·P̂w (equatorial world), toward periapsis, Mpc. */
  readonly semiMajorMpc: Vec3;
  /** Semi-minor axis B = b·Q̂w (equatorial world), prograde, Mpc. */
  readonly semiMinorMpc: Vec3;
  /** Eccentricity e, in [0, 1) — the fragment's E → M mapping needs it. */
  readonly eccentricity: number;
  /** Mean anomaly M of the body at the scene epoch (J2000), radians. */
  readonly meanAnomalyRad: number;
  /** Dim linear-RGB tint for the additive HDR draw. */
  readonly color: Vec3;
};
