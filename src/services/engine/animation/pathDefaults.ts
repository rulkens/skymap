/**
 * pathDefaults — the default flyPath pacing, in one place.
 *
 * A flythrough authored with no pacing knobs should already feel right, so the
 * `flyPath` helper stamps these onto every node and `buildPathTrack` falls back
 * to the align value for direct callers. They were tuned by eye against the
 * clip-path inspector's deterministic replay; change them here to reshape every
 * un-pinned flythrough at once.
 */

import type { SplineMode } from '../../../@types/animation/SplineMode';

/** Seconds to blend the live orientation into the down-the-path aim at the start. */
export const DEFAULT_ALIGN_SEC = 1.35;

/**
 * Seconds of ease ramp at EACH end of the trapezoidal speed envelope (short
 * accel + long constant-speed cruise + short decel). This is the default
 * envelope; author `rampSec: 0` on a flyPath to opt out and use the named `ease`.
 */
export const DEFAULT_RAMP_SEC = 1.4;

/**
 * Per-target brake depth ∈ [0,1] — a local velocity dip at each waypoint. 0 is
 * opt-in off (cruise straight through every target, no behaviour change); raise
 * it to make the camera slow down and dwell as it passes each galaxy.
 */
export const DEFAULT_LINGER = 0;

/**
 * Which spline basis a flyPath fits through its waypoints. `centripetal` is the
 * historical default (Catmull-Rom that banks early); `causalHermite` is the
 * head-on-arrival alternative. Default keeps every authored clip on the
 * centripetal curve until it explicitly opts in.
 */
export const DEFAULT_SPLINE: SplineMode = 'centripetal';

/**
 * Causal-Hermite tangent magnitude — the turn-delay / overshoot knob. 1 is the
 * natural chord-length tangent; 0 collapses to a smoothstep (eases to rest at
 * each knot); >1 shoots further along the approach before banking. Only consulted
 * when `spline` is `causalHermite`.
 */
export const DEFAULT_TURN_DELAY = 1;
