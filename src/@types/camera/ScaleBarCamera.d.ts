/**
 * ScaleBarCamera — minimum camera shape needed by `computeScaleInfo`.
 *
 * We deliberately accept just the two fields the math touches (rather
 * than an entire OrbitCamera) so tests don't need to construct full
 * camera state.
 */

export type ScaleBarCamera = {
  /** Range to what the bar measures at (the pivot surface when it has one). */
  distance: number;
  fovYRad: number;
};
