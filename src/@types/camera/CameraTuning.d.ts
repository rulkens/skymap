/** Live camera-band tuning (rulings 11 + 19): the two regime edges, the two
 * orientation-blend edges, and the two feel toggles, as ONE value threaded into
 * the camera math. Invariants (`clampCameraTuning` is the only producer):
 * disengageHR ≥ engageHR × 1.1, tiltZeroHR ≥ tiltFullHR × 1.1,
 * tiltZeroHR ≤ disengageHR — tilt must already be 0 where the arm flips. */
export type CameraTuning = {
  /** h/R at which the body arm takes over. */
  readonly engageHR: number;
  /** h/R at which it hands back (hysteresis). */
  readonly disengageHR: number;
  /** h/R at or below which the reference up is the pure body ENU (full tilt). */
  readonly tiltFullHR: number;
  /** h/R at or above which it is the scene up (zero tilt). */
  readonly tiltZeroHR: number;
  /** 'log' because zoom is multiplicative: half weight at the band's geometric midpoint. */
  readonly blendSpace: 'log' | 'lin';
  /** Gates the heading+roll framing authority ONLY, never the tilt wall. */
  readonly northUp: boolean;
};
