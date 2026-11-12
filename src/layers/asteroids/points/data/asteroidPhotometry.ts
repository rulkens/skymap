/** The dots' brightness defaults, each a DebugPanel "Asteroid tuning" row but `minDeltaAu`. */
export const ASTEROID_PHOTOMETRY = {
  /** Floor on Δ (AU), so a camera on top of a dot can't send its flux to infinity. */
  minDeltaAu: 1e-3,
  /** The lifted flux's discard floor as a V: at 16 a dot deposits well under 1/255. */
  limitingMag: 16,
  // Eye-tuned on dpr-2 shots: the floor frames Earth with the belt among the stars; past the cap
  // the belt's dots overlap, and a lift still growing with zoom² piled them into a blob at 50 AU.
  liftPerAu2: 6e3,
  liftFloorZoomAu: 9,
  liftCapZoomAu: 12,
  // The distant class's own cap: a few thousand dots on a ring 30–50 AU across never overlap, and
  // under the inner cap a TNO seen from 400 AU sits ~6 mag under the belt's look, so none drew.
  distantLiftCapZoomAu: 600,
  /** The phase law dims the belt's backlit near side ~7 mag, a hole; capped, it reads as a dimmer arc. */
  maxPhaseDimMag: 3.25,
  /** A dot's peak ceiling, far under the stars' knee of 8, so a patch reads by its dot count. */
  dotKnee: 0.2,
} as const;
