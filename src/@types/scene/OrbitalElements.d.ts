/**
 * OrbitalElements — one body's classical Keplerian elements at the epoch
 * (J2000), the single source of truth for both its rendered position AND its
 * orbit trail.
 *
 * Each classical field pairs with an OPTIONAL per-Julian-century rate, the six
 * `*RatePerCty` fields below, so `propagateElements` can advance the body to any
 * simulated instant as one affine map `field(T) = field₀ + rate·T`. The rates
 * are optional because a static body — one with no rates — must propagate to
 * itself: a missing rate reads as zero drift. Every animated row (planet or
 * moon) carries the SAME six rate fields, so the propagator never learns
 * "planet vs moon" — a satellite maker converts JPL's period/precession columns
 * into these same rate fields, keeping one linear propagation path for all.
 *
 * Elements are referenced to the plane named by `plane`, defaulting to the
 * **ecliptic** J2000 frame (the plane the planets and Earth's Moon orbit near);
 * a planet's own moons instead reference that planet's equatorial (Laplace)
 * frame — see `plane` and `data/bodies/orbitPlaneFrames`. Angles are stored in
 * radians and distances in Mpc, authored via `SCALE_UNITS` and `deg → rad` at
 * the seed site rather than as buried literals — the same discipline
 * `sceneBodies.ts` observes.
 *
 * `focusId` resolves the orbit's focus: `'sun'` is heliocentric (the Sun at
 * the render origin); any other body id (e.g. `'earth'`) makes the focus that
 * body's already-derived world position — the Moon's elements are geocentric,
 * so its trail follows Earth by construction. Every row names a focus; there
 * is no null case.
 */

import type { Vec3 } from '../math/Vec3';
import type { OrbitPlaneFrame } from './OrbitPlaneFrame';

export type OrbitalElements = {
  /** Stable identifier (e.g. `'earth'`, `'jupiter'`, `'moon'`). */
  readonly id: string;
  /** Focus body id; `'sun'` for heliocentric (Sun at the render origin). */
  readonly focusId: string;
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
  /** Mean anomaly M at the epoch (J2000) = L − ϖ, in radians. */
  readonly meanAnomalyRad: number;
  /** da/dt: semi-major-axis rate, in Mpc per Julian century. */
  readonly semiMajorRateMpcPerCty?: number;
  /** de/dt: eccentricity rate, per Julian century. */
  readonly eccentricityRatePerCty?: number;
  /** di/dt: inclination rate, in radians per Julian century. */
  readonly inclinationRateRadPerCty?: number;
  /** dΩ/dt: ascending-node rate, in radians per Julian century. */
  readonly ascendingNodeRateRadPerCty?: number;
  /** dω/dt = dϖ/dt − dΩ/dt: argument-of-periapsis rate, rad per Julian century. */
  readonly argPeriapsisRateRadPerCty?: number;
  /** dM/dt = dL/dt − dϖ/dt: mean-anomaly (mean-motion) rate, rad per Julian century. */
  readonly meanAnomalyRateRadPerCty?: number;
  /** Dim linear-RGB tint for the additive HDR draw. */
  readonly color: Vec3;
  /**
   * Reference plane the angles (i, Ω, ω) are measured in. Omitted → the
   * ecliptic (planets, Earth's Moon). A planet's own moons set this to that
   * planet's equatorial (Laplace) frame so their trails ride tilted with it.
   */
  readonly plane?: OrbitPlaneFrame;
};
