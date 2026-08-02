/**
 * GalaxySfMapOrientation — one CPU-side readback of `orientationTex`
 * (`sfMapOrientationCoherence.wesl`'s output), same log-polar grid shape as
 * `GalaxySfMap`. `data` packs the DOUBLE-ANGLE vector `(cos 2θ, sin 2θ)`
 * scaled by coherence per texel (length `az*rings*2`), never a bare angle —
 * orientation wraps at π (a filament has no head/tail), and only the
 * double-angle form survives interpolation/blending without a false
 * zero-crossing at that wrap. Read by `sampleSfMapOrientation`.
 */
export type GalaxySfMapOrientation = {
  readonly az: number;
  readonly rings: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly data: Float32Array;
};
