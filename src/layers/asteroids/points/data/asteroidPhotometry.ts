/**
 * The dots' brightness defaults shared by every class, each a DebugPanel "Asteroid tuning" row but
 * `minDeltaAu`; a class's own gain and flux floor are in `ASTEROID_CLASS_LOOK`.
 */
export const ASTEROID_PHOTOMETRY = {
  /** Floor on Δ (AU), so a camera on top of a dot can't send its flux to infinity. */
  minDeltaAu: 1e-3,
  /**
   * Display lift on the dots' flux (~14.5 mag): a monitor can't dark-adapt, so at true V the belt is
   * invisible. One constant, the old 9–12 AU zoom ramp's geometric middle; that ramp spanned 0.6 mag.
   */
  lift: 6.48e5,
  /** The phase law dims the belt's backlit near side ~7 mag, a hole; capped, it reads as a dimmer arc. */
  maxPhaseDimMag: 3.25,
} as const;
