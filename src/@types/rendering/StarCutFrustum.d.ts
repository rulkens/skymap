/**
 * `walkStarOctreeCut`'s off-screen-prune descriptor, in the camera-relative
 * parsec frame the walk's box math already works in. See `buildStarCutFrustum`
 * for the pick-slack sizing rationale.
 */

export type StarCutFrustum = {
  /**
   * Six unit-normalized `(nx, ny, nz, d)` planes PER VIEW — 24 floats each,
   * inside is `n·p + d ≥ 0`, a node kept if ANY view keeps it. A grow-only
   * scratch buffer (one capture/pick view vs a multi-view rig, every frame),
   * so its `length` can exceed the live data: `viewCount` is the authoritative
   * bound, never `planesPc.length / 24`.
   */
  readonly planesPc: Float64Array;
  /** Views actually written into `planesPc` this call — see `planesPc`. */
  readonly viewCount: number;
  /** Leaf angular slack, radians of on-screen spill per parsec of distance. */
  readonly angularMarginRad: number;
  /** Aggregate glow spread as a half-diagonal multiplier (`≥ 1`). */
  readonly worldSpread: number;
};
