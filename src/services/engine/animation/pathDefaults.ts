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
import type { SplineConfig } from '../../../@types/animation/SplineConfig';
import type { PassByDir } from '../../../@types/animation/PassByDir';

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
 * Causal-Hermite tangent magnitude — the turn-delay / overshoot knob. 1 is the
 * natural chord-length tangent; 0 collapses to a smoothstep (eases to rest at
 * each knot); >1 shoots further along the approach before banking. Only consulted
 * when `spline` is `causalHermite`. Tuned by eye against famousFlythrough.
 */
export const DEFAULT_TURN_DELAY = 1.1;

/**
 * Seconds the LOOK leads the eye along the path. 0 splines the per-knot forward
 * aim; > 0 aims at where the camera will be `lookAhead` seconds from now — paired
 * with `causalHermite` it flies into each target head-on, then turns toward the
 * next the moment the path bends past it. Tuned by eye against famousFlythrough.
 */
export const DEFAULT_LOOK_AHEAD = 1.3;

/**
 * Which spline basis a flyPath fits through its waypoints. `causalHermite`
 * (head-on arrival, turn after) is the default — it reads best flying between
 * discrete subjects; `centripetal` (Catmull-Rom that banks early) is the
 * alternative. See `DEFAULT_SPLINE_CONFIG` for the whole authored default.
 */
export const DEFAULT_SPLINE: SplineMode = 'causalHermite';

/**
 * The spline config a `flyPath` gets when it authors none — the tuned
 * cinematographic default (causal Hermite + the turn-delay / look-ahead above).
 * `buildPathTrack`'s own direct-call default stays neutral centripetal; this is
 * the AUTHORING default the `flyPath` helper stamps.
 */
export const DEFAULT_SPLINE_CONFIG: SplineConfig = {
  kind: 'causalHermite',
  turnDelay: DEFAULT_TURN_DELAY,
  lookAhead: DEFAULT_LOOK_AHEAD,
};

/**
 * Fly-past offset, in units of the subject's RADIUS. 0 (the default) flies the
 * eye through each interior waypoint's centre — the historical behaviour, right
 * for a group cloud. Raise it so the eye passes BESIDE each subject (a galaxy
 * flyby): ~4 fills the frame roughly a third; framing distance is ~16 radii.
 */
export const DEFAULT_PASS_BY_OFFSET = 0;

/** Which perpendicular the fly-past offset points along. See `PassByDir`. */
export const DEFAULT_PASS_BY_DIR: PassByDir = 'outsideBend';
