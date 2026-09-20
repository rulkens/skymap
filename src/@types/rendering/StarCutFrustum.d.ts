/**
 * StarCutFrustum — `walkStarOctreeCut`'s off-screen-prune descriptor: six
 * camera-relative parsec-space planes plus a conservative slack model, all in
 * the frame the walk's box math already works in (box centre = `boxOriginPc +
 * edge/2 − camPc`), so the hot loop needs no unit conversion.
 *
 * The slack is deliberately generous — a coarse pre-filter that must never
 * wrong-drop a node any downstream consumer would still paint:
 *   - `angularMarginRad`: a leaf draws as a fixed-PIXEL dot, so its world
 *     spill grows with distance; sized to the pick pass's 3.5px clickable
 *     floor (≥ the visual glow) so a pick recompute never drops an edge star.
 *   - `worldSpread`: an aggregate's glow spreads with the dot-size/overlap
 *     scale — a WORLD slack, a multiplier (`≥ 1`) on the box half-diagonal.
 * A subtree holding both species grows by BOTH terms summed.
 */

export type StarCutFrustum = {
  /**
   * Six unit-normalized `(nx, ny, nz, d)` planes in the camera-relative
   * parsec frame — 24 floats, inside is `n·p + d ≥ 0`.
   */
  readonly planesPc: Float64Array;
  /** Leaf angular slack, radians of on-screen spill per parsec of distance. */
  readonly angularMarginRad: number;
  /** Aggregate glow spread as a half-diagonal multiplier (`≥ 1`). */
  readonly worldSpread: number;
};
