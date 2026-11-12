/**
 * The dots' brightness anchors. Flux is 10^(−0.4·V) (the stars' fluxApp), lifted by
 * `asteroidExposureRamp` and the Layer's brightness setting before `STAR_FLUX_EXPOSURE`.
 * The ramp is exactly 1 out to `rampNearAu`, just past Earth's orbit, so the view from Earth stays true.
 */
export const ASTEROID_PHOTOMETRY = {
  /** V for a row MPC gives no H: a typical faint numbered belt asteroid seen from Earth. */
  noHMagnitude: 21,
  /** Discard floor on the lifted flux: V = 16, where a dot deposits well under 1/255. */
  minFlux: 10 ** (-0.4 * 16),
  /** Floor on Δ (AU, ~0.4 lunar distance) in V, so a camera on top of a dot can't send its flux to infinity. */
  minDeltaAu: 1e-3,
  rampNearAu: 1.5,
  // Eye-tuned top-down from 12 AU, where it lifts ~15.6 mag: the belt's median dot (V ≈ 24.6) lands
  // near V = 9, past `dotKnee`, so density reads as brightness and the sparse Trojans still show.
  rampFarAu: 30,
  rampFarLift: 1e9,
  /** Ceiling of a dot's peak (`asteroids/points/fragment.wesl`), far under the stars' knee of 8. */
  dotKnee: 0.2,
} as const;
