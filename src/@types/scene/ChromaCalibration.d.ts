import type { Vec2 } from '../math/Vec2';

/**
 * ChromaCalibration — the fitted linear map that inverts a published
 * enhanced-colour map's saturation. It acts on the illumination-invariant chroma
 * `c = RGB_linear / Y - 1` (Rec.709 `Y`, so `dot(LUM, c) = 0`: re-attaching the
 * result to any luminance preserves it, bar `panSharpenRgb`'s gamut clamp).
 * `matrix` is row-major over the COLUMN vector of `c`'s coordinates in the
 * orthonormal basis `panSharpenRgb` derives — any fit producing a `matrix` here
 * MUST have used that same basis — and `gain` scales the result. NOT a
 * saturation scalar: the fit is ~6.4x anisotropic (singular values 1.095 /
 * 0.172), crushing red-green where the enhancement lives while passing
 * yellow-blue through; collapse it to one number and Pluto's Cthulhu Macula
 * comes out pink.
 */
export type ChromaCalibration = {
  readonly matrix: readonly [Vec2, Vec2];
  readonly gain: number;
};
