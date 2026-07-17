/**
 * RotationElements — one body's IAU/WGCCRE J2000 mean rotation elements: the
 * direction its north pole points (RA/Dec on the equatorial sky) and the angle
 * of its prime meridian at the epoch. These three numbers are what tilt a
 * textured planet correctly and aim its 0° meridian — the axial-tilt + facing
 * counterpart to `OrbitalElements` (which places the body, not orients it).
 *
 * The scene is static at a single epoch (J2000), so only the constant terms are
 * stored. The published elements also carry rates — `α̇`, `δ̇`, and crucially the
 * spin rate `Ẇ` in `W(t) = W₀ + Ẇ·t` — that are deliberately omitted here.
 * Restoring `Ẇ` (and driving it from a scene clock) is the single named
 * extension point for an animated, rotating planet; until then W₀ freezes each
 * body's meridian at the epoch.
 *
 * Only the textured bodies need these: a flat-albedo or emissive sphere is
 * rotation-invariant, so the irregular moons carry none. Angles are authored in
 * degrees at the seed site (matching the JPL/IAU tables they come from) and
 * converted to a baked `Mat3` orientation once, via `rotationFromIau`.
 */

export type RotationElements = {
  /** Stable identifier (e.g. `'earth'`, `'saturn'`) — same id space as the bodies. */
  readonly id: string;
  /** IAU north-pole right ascension α₀, in degrees, referenced to J2000. */
  readonly poleRaDeg: number;
  /** IAU north-pole declination δ₀, in degrees, referenced to J2000. */
  readonly poleDecDeg: number;
  /** Prime meridian W₀ at the J2000 epoch, in degrees (the `Ẇ·t` term is omitted). */
  readonly primeMeridianDeg: number;
};
