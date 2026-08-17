import type { Vec2 } from '../math/Vec2';

/**
 * ChromaCalibration — the fitted linear map that inverts a published
 * enhanced-colour map's saturation. It acts on the illumination-invariant chroma
 * `c = RGB_linear / Y - 1` (Rec.709 `Y`, so `dot(LUM, c) = 0` and re-attaching
 * the result to any luminance preserves that luminance exactly).
 *
 * `matrix` is row-major and applies to the COLUMN vector of `c`'s coordinates in
 * the plane's orthonormal basis — Gram-Schmidt over `(1, 0, -Lr/Lb)` then
 * `(0, 1, -Lg/Lb)`, the two "raise one channel, pay for it in blue" directions
 * (`panSharpenRgb` derives it; the fit that produced any `matrix` here MUST have
 * used the same one). `gain` then scales the whole result.
 *
 * NOT a saturation scalar: the fit is ~6.4x anisotropic (singular values
 * 1.095 / 0.172). It passes the yellow-blue axis through nearly untouched and
 * crushes red-green, which is where the published enhancement lives — collapse
 * it to one number and Pluto's Cthulhu Macula comes out pink.
 */
export type ChromaCalibration = {
  readonly matrix: readonly [Vec2, Vec2];
  readonly gain: number;
};
