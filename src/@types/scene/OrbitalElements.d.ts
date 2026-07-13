/**
 * OrbitalElements — one body's classical Keplerian elements at the scene epoch
 * (J2000), the single source of truth for both its rendered position AND its
 * orbit trail.
 *
 * The scene is static at a single epoch (no clock, no time propagation), so
 * only the epoch column of the J2000 mean elements is stored — the element
 * rates recorded in the spec's provenance table are deliberately omitted
 * (YAGNI: a future animated ephemeris is the named extension point).
 *
 * Elements are referenced to the **ecliptic** J2000 frame (the plane every
 * solar-system body orbits near); the ecliptic→equatorial rotation into the
 * scene's frame is `ECLIPTIC_BASIS`. Angles are stored in radians and
 * distances in Mpc, authored via `SCALE_UNITS` and `deg → rad` at the seed
 * site rather than as buried literals — the same discipline `sceneBodies.ts`
 * observes.
 *
 * `parentId` resolves the orbit's focus: `null` is heliocentric (the Sun at
 * the render origin); a body id (e.g. `'earth'`) makes the focus that parent's
 * already-derived world position — the Moon's elements are geocentric, so its
 * trail follows Earth by construction.
 */

import type { Vec3 } from '../math/Vec3';

export type OrbitalElements = {
  /** Stable identifier (e.g. `'earth'`, `'jupiter'`, `'moon'`). */
  readonly id: string;
  /** Parent body id, or `null` for heliocentric (Sun at the render origin). */
  readonly parentId: string | null;
  /** Semi-major axis a, in Mpc (authored via `SCALE_UNITS`). */
  readonly semiMajorMpc: number;
  /** Eccentricity e, in [0, 1). Circular at e = 0. */
  readonly eccentricity: number;
  /** Inclination i, in radians. */
  readonly inclinationRad: number;
  /** Longitude of the ascending node Ω, in radians. */
  readonly ascendingNodeRad: number;
  /** Argument of periapsis ω = ϖ − Ω, in radians. */
  readonly argPeriapsisRad: number;
  /** Mean anomaly M at the scene epoch (J2000) = L − ϖ, in radians. */
  readonly meanAnomalyRad: number;
  /** Dim linear-RGB tint for the additive HDR draw. */
  readonly color: Vec3;
};
