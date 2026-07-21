/**
 * BodyState — a scene body's *time-varying* state at one sim instant: where it
 * is, how it is facing, and where it sits on its orbit. The half of a body that
 * a clock moves, split off from the half that never changes.
 *
 * ### Why identity and state are separate types
 *
 * A `PlanetBody` / `EarthBody` record braids two independently-varying concerns:
 * fixed identity (id, label, radius, albedo, texture family) and epoch state
 * (position, orientation, orbital phase). Baking both together at module load
 * froze the scene at J2000 — the only position a body could ever have was the
 * one computed once, at import. To let a clock drive the bodies we lift the
 * mutable half out: identity stays authored data, and `BodyState` is *derived*
 * per frame by `deriveBodyStates(simDays)` from the one Keplerian element table.
 * Two things that vary on different axes (identity never; state every tick) get
 * two types, so a consumer that only needs a position no longer carries the
 * whole authored record, and a clock updates state without touching identity.
 *
 * The alternative — a single record whose position field is reassigned each
 * frame — keeps the braid and forces every reader to know which fields are live
 * and which are frozen. Separating them makes "what the clock moves" the shape
 * of the type rather than a comment.
 */

import type { Vec3 } from '../math/Vec3';
import type { Mat3 } from '../math/Mat3';

export type BodyState = {
  /** Absolute heliocentric world position, in Mpc — f64-valued. */
  readonly positionMpc: Vec3;
  /** Local → equatorial-world rotation (identity when no facing is modelled). */
  readonly orientation: Mat3;
  /** Mean anomaly M at this instant, in radians — the orbit-trail falloff anchor. */
  readonly meanAnomalyRad: number;
};
