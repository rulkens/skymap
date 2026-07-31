/**
 * glideCalibration — ρ, V and the duration clamp for a focus glide. Calibrated
 * together against skymap's 19-decade scale range and meaningless apart; the
 * paper's own V = 0.9 gives 22–35 s moves here, so V needed its own derivation
 * and the duration needed a clamp. Derivation: spec §5.1 / §5.3,
 * docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md
 */

/** Pan/zoom trade-off ρ passed to `zoomPanGeodesic`. */
export const GLIDE_RHO_DEFAULT = 1.42;

/** Geodesic arc-length units per second: durationSec = length / V. */
export const GLIDE_VELOCITY = 6;

export const GLIDE_MIN_SEC = 0.4;

/** A move clamped at either bound is no longer perceptually uniform. */
export const GLIDE_MAX_SEC = 4.0;
