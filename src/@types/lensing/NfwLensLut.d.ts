/**
 * NfwLensLut — precomputed inverse-NFW-lens-equation table.
 *
 * The dimensionless NFW lens equation is `y = x − s·m(x)`, where y is the
 * true source position, x is the image position (both in scale-radius units),
 * s is the reduced lensing strength, and `m(x) = g(x)/x` is the Wright &
 * Brainerd enclosed-mass shape (peak-normalised). Inverting this analytically
 * is intractable, so we tabulate the results over a (y, s) grid at build time
 * and look them up from the GPU vertex stage.
 *
 * Each cell stores the primary image position and magnification plus the
 * counter-image (if any). The GPU resource (Phase 3) packs these f32 values
 * into an f16 texture; this type holds the raw f32 source array.
 */
export type NfwLensLut = {
  /** Grid resolution along the source-position (y) axis = texture width. */
  readonly width: number;
  /** Grid resolution along the reduced-strength (s) axis = texture height. */
  readonly height: number;
  /** Max source position (dimensionless) the y-axis spans, [0, yMax]. */
  readonly yMax: number;
  /** Max reduced strength the s-axis spans; the s-axis is LOG-scaled, [0, sMax]. */
  readonly sMax: number;
  /**
   * width*height*4 f32 values, row-major (y fastest), 4 channels per cell:
   *   [xPrimary, muPrimary, xCounter, muCounter]
   * xCounter == 0 AND muCounter == 0 ⇒ no secondary image in this cell.
   * f32 source array — the GPU resource (Phase 3) packs these to f16 on upload.
   */
  readonly data: Float32Array;
};
