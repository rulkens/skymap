/**
 * Thresholds governing when the body-fixed surface camera arm engages. The band
 * edges are LIVE-TUNABLE (ruling 11) and session-only — every consumer (regime
 * hysteresis, `bodyUpWeight` band, `maxTiltRad` ramp, debug readout) reads THIS
 * record at call time, so a slider moves regime and orientation band together;
 * ruling 10 forbids them diverging. Writes go through `setSurfaceBand`.
 */
import type { SurfaceBandKnob } from '../../@types/camera/SurfaceBandKnob';

export const SURFACE_REGIME = {
  /** h/R at which the body arm takes over — 0.2 R ≈ 1,275 km over Earth (ruling 19). */
  engageHR: 0.2,
  /** h/R at which it hands back: 2× hysteresis (ruling 19). */
  disengageHR: 0.4,
  /** Tilt ceiling at ground level: π = zenith, reached via look mode (Q5). */
  tiltMaxRad: Math.PI,
  /** h/R below which the full ceiling is open. Feel-tunable (Q5). */
  tiltFullHR: 0.02,
};

/** Slider ranges + the hysteresis floor (disengage ≥ engage × minRatio). */
export const SURFACE_BAND_LIMITS = {
  engageMin: 0.1,
  engageMax: 3.0,
  disengageMin: 0.2,
  disengageMax: 6.0,
  minRatio: 1.1,
} as const;

/**
 * The one write path for the band edges: clamp each knob to its range, then
 * keep the hysteresis open — the knob the caller moved wins, the other yields.
 * Returns which knob the floor moved (never the one the caller patched), or
 * `null` when no correction was due, so the debug readout's "AT FLOOR" state
 * names it rather than re-deriving it.
 */
export function setSurfaceBand(patch: {
  readonly engageHR?: number;
  readonly disengageHR?: number;
}): SurfaceBandKnob {
  const L = SURFACE_BAND_LIMITS;
  if (patch.engageHR !== undefined) {
    SURFACE_REGIME.engageHR = Math.min(L.engageMax, Math.max(L.engageMin, patch.engageHR));
  }
  if (patch.disengageHR !== undefined) {
    SURFACE_REGIME.disengageHR = Math.min(
      L.disengageMax,
      Math.max(L.disengageMin, patch.disengageHR),
    );
  }
  if (SURFACE_REGIME.disengageHR < SURFACE_REGIME.engageHR * L.minRatio) {
    if (patch.disengageHR !== undefined && patch.engageHR === undefined) {
      SURFACE_REGIME.engageHR = Math.max(L.engageMin, SURFACE_REGIME.disengageHR / L.minRatio);
      return 'engage';
    }
    SURFACE_REGIME.disengageHR = Math.min(L.disengageMax, SURFACE_REGIME.engageHR * L.minRatio);
    return 'disengage';
  }
  return null;
}
