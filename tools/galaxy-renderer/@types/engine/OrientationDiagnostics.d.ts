/**
 * OrientationDiagnostics — permanent debug readout for the ISM-map ->
 * dust-elongation coupling (`IsmMapSection`'s "measured filament coupling"
 * block). `hasData: false` means the readback never landed; near-zero
 * coherence means the generator has no measurable structure yet.
 */

export type OrientationDiagnostics = {
  /** Whether `orientationTex`'s CPU readback has landed at least once. */
  readonly hasData: boolean;
  /** The readback token it landed from — bumps on every dispatch, so a stale reader can tell a new one is pending. */
  readonly generation: number;
  /** Mean of `hypot(cos2theta, sin2theta)` over the orientation grid. */
  readonly meanCoherence: number;
  /** Max of the same, over the same grid. */
  readonly maxCoherence: number;
};
