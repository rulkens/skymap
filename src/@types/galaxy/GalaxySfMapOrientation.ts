/**
 * GalaxySfMapOrientation — a per-texel structure-tensor orientation field
 * over a `GalaxySfMap`'s oldActivity channel, same log-polar grid shape.
 * `data` packs the DOUBLE-ANGLE vector `(cos 2θ, sin 2θ)` scaled by
 * coherence per texel (length `az*rings*2`) rather than a bare angle,
 * because orientation wraps at π (a filament has no head/tail) and only the
 * double-angle form can be averaged/interpolated without a false zero-crossing
 * at that wrap. Built by `buildSfMapOrientation`, read by
 * `sampleSfMapOrientation`.
 */
export type GalaxySfMapOrientation = {
  readonly az: number;
  readonly rings: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly data: Float32Array;
};
