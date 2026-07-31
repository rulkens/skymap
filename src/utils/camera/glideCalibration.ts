/**
 * glideCalibration — ρ, V and the duration clamp for a focus glide. Calibrated
 * together against skymap's 19-decade scale range and meaningless apart; the
 * paper's own V = 0.9 gives 22–35 s moves here, so V needed its own derivation
 * and the duration needed a clamp. Derivation: spec §5.1 / §5.3,
 * docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md
 */

import type { GlideTuning } from '../../@types/camera/GlideTuning';

/**
 * Pan/zoom trade-off ρ passed to `zoomPanGeodesic`. Low ρ makes zooming
 * expensive in the metric and panning cheap, so the path stops climbing: the
 * paper's user-study ρ = 1.42 rose to 8.79× the endpoint distance on a galaxy
 * click, which read as an unwanted zoom-out. The cost is that a long hop is
 * lateral travel, not a rise.
 *
 * **The path CONVERGES below ~0.05** — measured identical at 0.05, 0.02, 0.01
 * and 0.001: no rise at all, and a pure zoom passing through the geometric
 * mean. So this is the ρ→0 limit, and lowering it further buys nothing.
 *
 * Below ~0.3 the arc length also goes BIMODAL — the 1/ρ² weight on the zoom
 * term swamps the pan term, so same-scale moves collapse to ~1 unit and
 * scale-changing ones explode past 180. Most moves therefore land on a clamp
 * bound rather than on a derived duration; see GLIDE_MIN_SEC / GLIDE_MAX_SEC.
 */
export const GLIDE_RHO_DEFAULT = 0.05;

/**
 * ρ = 0 is a SINGULARITY, not a small value: the metric's zoom term is 1/ρ²,
 * so `b` divides by zero, `asinh(∓Infinity)` is ∓Infinity, and `length`
 * evaluates `(∞−∞)/0` → NaN. A NaN pose is a dead camera, and nothing
 * downstream rejects one. `glidePath` clamps to this floor so no UI control or
 * clip author can reach it; the limit behaviour is already had at 0.05.
 */
export const GLIDE_RHO_MIN = 0.001;

/** Geodesic arc-length units per second: durationSec = length / V. */
export const GLIDE_VELOCITY = 20;

export const GLIDE_MIN_SEC = 0.3;

/** A move clamped at either bound is no longer perceptually uniform. */
export const GLIDE_MAX_SEC = 1.5;

/**
 * The four constants above as one record — what `glidePath` falls back to and
 * what the DebugPanel's live-tuning sliders seed from, so the numbers stay
 * spelled once.
 */
export const DEFAULT_GLIDE_TUNING: GlideTuning = {
  rho: GLIDE_RHO_DEFAULT,
  velocity: GLIDE_VELOCITY,
  minSec: GLIDE_MIN_SEC,
  maxSec: GLIDE_MAX_SEC,
};
