/**
 * ZoomPanGeodesic — a van Wijk & Nuij optimal zoom/pan path through (u, w) view
 * space, parametrised by arc length in their perceptual metric.
 *
 * Unit-agnostic: `u` (position along the straight target segment) and `w`
 * (viewport width) carry whatever single world unit the caller supplies, and
 * must carry the SAME one — see `zoomPanGeodesic.ts`.
 */

/** An optimal zoom/pan path, sampled by arc position. */
export type ZoomPanGeodesic = {
  /** Total path length in the (u, w) metric. Duration is length / V. */
  readonly length: number;
  /** s ∈ [0, length] → the (u, w) view at that arc position. */
  readonly at: (s: number) => { readonly u: number; readonly w: number };
};
