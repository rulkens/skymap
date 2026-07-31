/**
 * glideCalibration — ρ, V and the duration clamp for a focus glide. Calibrated
 * together against skymap's 19-decade scale range and meaningless apart; the
 * paper's own V = 0.9 gives 22–35 s moves here, so V needed its own derivation
 * and the duration needed a clamp. Derivation: spec §5.1 / §5.3,
 * docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md
 */

/**
 * Pan/zoom trade-off ρ passed to `zoomPanGeodesic`. Low ρ makes zooming
 * expensive in the metric and panning cheap, so the path stops climbing: the
 * paper's user-study ρ = 1.42 rose to 8.79× the endpoint distance on a galaxy
 * click, which read as an unwanted zoom-out. Here it never rises past its
 * destination. The cost is that a long hop is lateral travel, not a rise.
 *
 * Below ~0.3 the arc length goes BIMODAL — the 1/ρ² weight on the zoom term
 * swamps the pan term, so same-scale moves collapse to ~1 unit and
 * scale-changing ones explode past 180. Most moves therefore land on a clamp
 * bound rather than on a derived duration; see GLIDE_MIN_SEC / GLIDE_MAX_SEC.
 */
export const GLIDE_RHO_DEFAULT = 0.15;

/** Geodesic arc-length units per second: durationSec = length / V. */
export const GLIDE_VELOCITY = 20;

export const GLIDE_MIN_SEC = 0.3;

/** A move clamped at either bound is no longer perceptually uniform. */
export const GLIDE_MAX_SEC = 2.0;
