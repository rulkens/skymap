/**
 * `walkStarOctreeCut`'s off-screen-prune descriptor, in the camera-relative
 * parsec frame the walk's box math already works in. See `buildStarCutFrustum`
 * for the pick-slack sizing rationale.
 */

export type StarCutFrustum = {
  /**
   * Six unit-normalized `(nx, ny, nz, d)` planes PER VIEW — 24 floats each,
   * inside is `n·p + d ≥ 0`, a node kept if ANY view keeps it. A `subarray`
   * over a grow-only backing buffer (one capture/pick view vs a multi-view
   * rig, every frame), so `length` IS the live view count × 24 — never a
   * separate field to fall out of step with it.
   */
  readonly planesPc: Float64Array;
  /** Leaf angular slack, radians of on-screen spill per parsec of distance. */
  readonly angularMarginRad: number;
  /** Aggregate glow spread as a half-diagonal multiplier (`≥ 1`). */
  readonly worldSpread: number;
};
