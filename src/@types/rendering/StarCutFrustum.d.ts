/**
 * `walkStarOctreeCut`'s off-screen-prune descriptor, in the camera-relative
 * parsec frame the walk's box math already works in. See `buildStarCutFrustum`
 * for the pick-slack sizing rationale.
 */

export type StarCutFrustum = {
  /** Six unit-normalized `(nx, ny, nz, d)` planes — inside is `n·p + d ≥ 0`. */
  readonly planesPc: Float64Array;
  /** Leaf angular slack, radians of on-screen spill per parsec of distance. */
  readonly angularMarginRad: number;
  /** Aggregate glow spread as a half-diagonal multiplier (`≥ 1`). */
  readonly worldSpread: number;
};
