/**
 * The dots' brightness anchors. Flux is 10^(−0.4·V) (the stars' fluxApp), lifted by
 * `asteroidExposureRamp` and the Layer's brightness setting before `STAR_FLUX_EXPOSURE`.
 * The ramp is exactly 1 out to `rampNearAu`, just past Earth's orbit, so the view from Earth stays true.
 */
export const ASTEROID_PHOTOMETRY = {
  /** V for a row MPC gives no H: a typical faint numbered belt asteroid seen from Earth. */
  noHMagnitude: 21,
  /** Discard floor on the lifted flux: V = 16, where a 1.5 px dot deposits well under 1/255. */
  minFlux: 10 ** (-0.4 * 16),
  rampNearAu: 1.5,
  // Provisional until Task 8's shots: lifts a V = 20 belt asteroid seen from 10 AU to about V = 12.
  rampFarAu: 30,
  rampFarLift: 1e5,
} as const;
