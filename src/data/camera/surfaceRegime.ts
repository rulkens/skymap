/**
 * Thresholds governing when the body-fixed surface camera arm engages.
 * The band edges are LIVE-TUNABLE for the round-9 feel trial (ruling 11) —
 * every consumer (regime hysteresis, `bodyUpWeight` band, `maxTiltRad`
 * ramp, debug readout) reads THIS record at call time, so the sliders move
 * regime and orientation band together: ruling 10 forbids them diverging.
 * Writes go through `setSurfaceBand`, which owns the clamps. Session-only.
 */
export const SURFACE_REGIME = {
  /** h/R at which the body arm takes over (ruled, Q6: ~1.7 R ≈ 11,000 km). */
  engageHR: 1.7,
  /** h/R at which it hands back. 2× hysteresis (ruled, Q6). */
  disengageHR: 3.4,
  /** Tilt ceiling at ground level: π = zenith, reached via look mode (Q5). */
  tiltMaxRad: Math.PI,
  /** h/R below which the full ceiling is open. Feel-tunable (Q5); open until the Task 22 feel gate. */
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
 * The one write path for the band edges: clamps each knob to its range,
 * then keeps the hysteresis open — the knob the caller moved wins, the
 * other yields (moving disengage below the floor pulls engage down;
 * moving engage above it pushes disengage up).
 */
export function setSurfaceBand(patch: {
  readonly engageHR?: number;
  readonly disengageHR?: number;
}): void {
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
    } else {
      SURFACE_REGIME.disengageHR = Math.min(L.disengageMax, SURFACE_REGIME.engageHR * L.minRatio);
    }
  }
}
