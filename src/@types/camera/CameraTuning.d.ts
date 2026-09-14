/** Live camera-band tuning (rulings 11 + 19): the two regime edges, the two
 * orientation-blend edges and the two feel toggles, as ONE value threaded into
 * the camera math. `clampCameraTuning` is the only producer of a legal one —
 * the cross-edge invariants live there. */
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
