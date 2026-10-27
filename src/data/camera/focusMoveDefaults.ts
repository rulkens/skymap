/**
 * focusMoveDefaults — the calibration a focus move starts from, before the
 * DebugPanel sliders re-tune it. The Geodesic numbers were settled by eye, not
 * derived; the working is in spec §5,
 * docs/superpowers/specs/2026-10-27-geodesic-focus-moves-design.md
 */

import type { GeodesicTuning } from '../../@types/camera/GeodesicTuning';
import type { Ease } from '../../@types/animation/Ease';

/**
 * ρ = 0 is a SINGULARITY, not a small value: the 1/ρ² zoom term makes `length`
 * evaluate (∞−∞)/0 → NaN, and a NaN pose is a dead camera nothing rejects.
 */
export const GEODESIC_RHO_MIN = 0.001;

/**
 * ρ = 0.18: low ρ prices zooming high, so the path stops climbing (the paper's
 * 1.42 rose to 8.79× the endpoint distance on a galaxy click). Below ~0.3 the
 * arc length goes bimodal, so most moves land on a clamp bound. easeOutQuint
 * beat `linear` on arrival dwell, 61.5 % against 8.8 %.
 */
export const DEFAULT_GEODESIC_TUNING: GeodesicTuning = {
  rho: 0.18,
  velocity: 20,
  minMs: 600,
  maxMs: 2200,
  ease: 'easeOutQuint',
};

/** Monotone only: an overshoot ease walks the arc past its endpoint (the camera
 *  flies through the target and back), and a bounce shuttles along the path. */
export const GEODESIC_EASES: readonly Ease[] = [
  'linear',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInQuart',
  'easeOutQuart',
  'easeInOutQuart',
  'easeInQuint',
  'easeOutQuint',
  'easeInOutQuint',
  'easeInExpo',
  'easeOutExpo',
  'easeInOutExpo',
  'easeInCirc',
  'easeOutCirc',
  'easeInOutCirc',
];
