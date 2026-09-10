/**
 * The orientation blend's own band (user ruling 2026-09-10, revising ruling
 * 10): `bodyUpWeight` is 1 at or below `fullHR`, 0 at or above `zeroHR`, and
 * display tilt is `remembered × that`. Session-only and live-tunable like
 * `SURFACE_REGIME`, which it no longer shares edges with; writes go through
 * `setTiltBand`. The one hard invariant is `zeroHR ≤ disengageHR`: the arm
 * flips at disengage, so tilt must already be 0 there (`engageFlipPop` guards
 * the pop). Cyclic with `surfaceRegime` by design — both write paths have to
 * settle that invariant, and it needs both records.
 */
import type { TiltBandKnob } from '../../@types/camera/TiltBandKnob';
import { SURFACE_REGIME } from './surfaceRegime';

export const TILT_BAND = {
  /** h/R at or below which the reference up is the pure body ENU (full tilt). */
  fullHR: 0.45,
  /** h/R at or above which it is the scene up (zero tilt). */
  zeroHR: 0.9,
};

/** Slider ranges + the same ×1.1 window floor the surface band keeps. */
export const TILT_BAND_LIMITS = {
  fullMin: 0.01,
  fullMax: 3.0,
  zeroMin: 0.05,
  zeroMax: 6.0,
  minRatio: 1.1,
} as const;

/**
 * The one write path: clamp each knob to its range, cap `zeroHR` at the
 * disengage edge, then keep the window open — the knob the caller moved wins,
 * except against the cap, which outranks it. Called with an empty patch from
 * `setSurfaceBand` so lowering disengage drags `zeroHR` down with it. Returns
 * the knob a clamp moved (never the one the caller patched), or `null`.
 */
export function setTiltBand(patch: {
  readonly fullHR?: number;
  readonly zeroHR?: number;
}): TiltBandKnob {
  const L = TILT_BAND_LIMITS;
  if (patch.fullHR !== undefined) {
    TILT_BAND.fullHR = Math.min(L.fullMax, Math.max(L.fullMin, patch.fullHR));
  }
  if (patch.zeroHR !== undefined) {
    TILT_BAND.zeroHR = Math.min(L.zeroMax, Math.max(L.zeroMin, patch.zeroHR));
  }

  const cap = Math.min(L.zeroMax, SURFACE_REGIME.disengageHR);
  let moved: TiltBandKnob = null;
  if (TILT_BAND.zeroHR > cap) {
    TILT_BAND.zeroHR = cap;
    moved = 'zero';
  }
  if (TILT_BAND.zeroHR < TILT_BAND.fullHR * L.minRatio) {
    const raised = TILT_BAND.fullHR * L.minRatio;
    if (patch.fullHR !== undefined && raised <= cap) {
      TILT_BAND.zeroHR = raised;
      return 'zero';
    }
    TILT_BAND.fullHR = Math.max(L.fullMin, TILT_BAND.zeroHR / L.minRatio);
    return 'full';
  }
  return moved;
}
