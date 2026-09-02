/** Thresholds governing when the body-fixed surface camera arm engages. */
export const SURFACE_REGIME = {
  /** h/R at which the body arm takes over (ruled, Q6: ~1.7 R ≈ 11,000 km). */
  engageHR: 1.7,
  /** h/R at which it hands back. 2× hysteresis (ruled, Q6). */
  disengageHR: 3.4,
  /** Tilt ceiling at ground level: π = zenith, reached via look mode (Q5). */
  tiltMaxRad: Math.PI,
  /** h/R below which the full ceiling is open. Feel-tunable (Q5); open until the Task 22 feel gate. */
  tiltFullHR: 0.02,
} as const;
