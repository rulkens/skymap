/**
 * RotationElements — one body's IAU/WGCCRE J2000 mean rotation elements: the
 * direction its north pole points (RA/Dec on the equatorial sky) and the angle
 * of its prime meridian at the epoch. These three numbers are what tilt a
 * textured planet correctly and aim its 0° meridian — the axial-tilt + facing
 * counterpart to `OrbitalElements` (which places the body, not orients it).
 *
 * The published elements are `W(t) = W₀ + Ẇ·d` for the prime meridian and
 * `α₀ + α̇·T`, `δ₀ + δ̇·T` for the pole (d = days from J2000, T = centuries). The
 * spin rate `Ẇ` is stored per row and drives each body's live meridian as the
 * scene clock advances — this is what makes a textured planet visibly rotate.
 * The pole's own rates `α̇`/`δ̇` are deliberately dropped: they shift the pole by
 * under an arcminute over 250 years, far below a textured sphere's resolution, so
 * the constant α₀/δ₀ pole is authored and only W turns.
 *
 * Only the textured bodies need these: a flat-albedo or emissive sphere is
 * rotation-invariant, so the irregular moons carry none. Angles are authored in
 * degrees at the seed site (matching the JPL/IAU tables they come from) and
 * composed into a `Mat3` orientation via `rotationFromIau`.
 */

export type RotationElements = {
  /** Stable identifier (e.g. `'earth'`, `'saturn'`) — same id space as the bodies. */
  readonly id: string;
  /** IAU north-pole right ascension α₀, in degrees at J2000 (the α̇ rate is dropped). */
  readonly poleRaDeg: number;
  /** IAU north-pole declination δ₀, in degrees at J2000 (the δ̇ rate is dropped). */
  readonly poleDecDeg: number;
  /** Prime meridian W₀ at the J2000 epoch, in degrees; the live W is W₀ + Ẇ·d. */
  readonly primeMeridianDeg: number;
  /** Spin rate Ẇ, degrees per day — advances the prime meridian from W₀. */
  readonly spinRateDegPerDay: number;
};
