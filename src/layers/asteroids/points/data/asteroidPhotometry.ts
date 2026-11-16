/**
 * The dots' brightness defaults shared by every class, each a DebugPanel "Asteroid tuning" row but
 * `minDeltaAu`; a class's own gain and flux floor are in `ASTEROID_CLASS_LOOK`.
 */
export const ASTEROID_PHOTOMETRY = {
  /** Floor on Δ (AU), so a camera on top of a dot can't send its flux to infinity. */
  minDeltaAu: 1e-3,
  // Eye-tuned on dpr-2 shots: the floor frames Earth with the belt among the stars; past the cap
  // the belt's dots overlap, and a lift still growing with zoom² piled them into a blob at 50 AU.
  liftPerAu2: 6e3,
  liftFloorZoomAu: 9,
  liftCapZoomAu: 12,
  /** The phase law dims the belt's backlit near side ~7 mag, a hole; capped, it reads as a dimmer arc. */
  maxPhaseDimMag: 3.25,
} as const;
