/**
 * glideCalibration — ρ, V, the duration clamp and the arrival curve for a focus
 * glide, calibrated together against skymap's 19-decade scale range and
 * meaningless apart. Over the comment budget: the derivations ARE the content
 * here. Full working: spec §5.1 / §5.3,
 * docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md
 */

import type { GlideTuning } from '../../@types/camera/GlideTuning';
import type { Ease } from '../../@types/animation/Ease';

/**
 * Pan/zoom trade-off ρ for `zoomPanGeodesic`. Low ρ prices zooming high, so the
 * path stops climbing: the paper's ρ = 1.42 rose to 8.79× the endpoint distance
 * on a galaxy click, reading as an unwanted zoom-out. Below ~0.05 the path
 * converges (already the ρ→0 limit) and below ~0.3 the arc length goes bimodal,
 * which is why most moves land on a clamp bound rather than a derived duration.
 */
export const GLIDE_RHO_DEFAULT = 0.18;

/**
 * ρ = 0 is a SINGULARITY, not a small value: the 1/ρ² zoom term makes `length`
 * evaluate (∞−∞)/0 → NaN, and a NaN pose is a dead camera nothing rejects.
 */
export const GLIDE_RHO_MIN = 0.001;

/** Geodesic arc-length units per second: durationSec = length / V. */
export const GLIDE_VELOCITY = 20;

export const GLIDE_MIN_SEC = 0.6;

/** A move clamped at either bound is no longer perceptually uniform. */
export const GLIDE_MAX_SEC = 2.2;

/** The arrival curve EVERY glide eases on, whatever authored it: a focus tween
 *  and a clip-authored `glide()` with no `ease` both fall through to here. */
export const GLIDE_EASE_DEFAULT: Ease = 'easeOutQuint';

/** The constants above as one record — what `glidePath` and `buildGlideTrack`
 *  fall back to, and what the DebugPanel's sliders seed from. */
export const DEFAULT_GLIDE_TUNING: GlideTuning = {
  rho: GLIDE_RHO_DEFAULT,
  velocity: GLIDE_VELOCITY,
  minSec: GLIDE_MIN_SEC,
  maxSec: GLIDE_MAX_SEC,
  ease: GLIDE_EASE_DEFAULT,
};
