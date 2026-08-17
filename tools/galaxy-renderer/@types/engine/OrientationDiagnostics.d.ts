/**
 * OrientationDiagnostics — permanent debug readout for the ISM-map ->
 * dust-elongation coupling (`IsmMapSection`'s "measured filament coupling"
 * block). The three numbers discriminate where a "sliders don't move the
 * dust" report is coming from: `hasData: false` means the readback never
 * landed; near-zero coherence means the generator has no measurable
 * structure yet; fine coherence with near-zero delta means the coupling
 * works but the measured orientation already agrees with the arm tangent.
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
  /** Mean |delta| actually applied by `rotateFrameToOrientation` during the last dust build, degrees. */
  readonly meanDeltaDeg: number;
  /** Max of the same, over the same build. */
  readonly maxDeltaDeg: number;
};
