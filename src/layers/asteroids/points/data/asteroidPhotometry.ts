/**
 * The dots' brightness anchors. Flux is 10^(−0.4·V) (the stars' fluxApp), lifted by
 * `asteroidExposureRamp` and the Layer's brightness setting before `STAR_FLUX_EXPOSURE`.
 */
export const ASTEROID_PHOTOMETRY = {
  /** V for a row MPC gives no H: a typical faint numbered belt asteroid seen from Earth. */
  noHMagnitude: 21,
  /** Discard floor on the lifted flux: V = 16, where a dot deposits well under 1/255. */
  minFlux: 10 ** (-0.4 * 16),
  /** Floor on Δ (AU, ~0.4 lunar distance) in V, so a camera on top of a dot can't send its flux to infinity. */
  minDeltaAu: 1e-3,
  // Lift = liftPerAu2 · zoom², zoom clamped to [floor, cap], eye-tuned on shots (2.2e5 to 8.6e5). The
  // floor is the lift framing Earth or the inner system, where the belt shows as a field of dots among
  // the stars; at the cap, top-down on the whole belt, its dots start to overlap, so a lift still
  // growing with zoom² would pile them into a blob (it did at 50 AU).
  liftPerAu2: 6e3,
  liftFloorZoomAu: 6,
  liftCapZoomAu: 12,
  /** Ceiling of a dot's peak (`asteroids/points/fragment.wesl`), far under the stars' knee of 8. */
  dotKnee: 0.2,
  /**
   * Floor on the selected dot's peak, enough to saturate `dotKnee`; the vertex shader also lifts that
   * dot's ceiling by 1 / `dotKnee`, so a followed asteroid shows at full white whatever its flux.
   */
  selectedMinPeak: 1,
} as const;
