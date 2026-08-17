import type { Vec2 } from '../math/Vec2';

/**
 * ChromaCalibration — the fitted linear map inverting a published enhanced-colour
 * map's saturation. It acts on illumination-invariant chroma
 * `c = RGB_linear / Y - 1` (Rec.709 `Y`); `matrix` is row-major over the COLUMN
 * vector of `c`'s coordinates in the orthonormal basis `panSharpenRgb` derives —
 * any fit producing a `matrix` here MUST have used that same basis — and `gain`
 * scales the result. NOT a saturation scalar: the fit is ~6.4x anisotropic
 * (singular values 1.095 / 0.172), crushing red-green where the enhancement lives
 * while passing yellow-blue; one number turns Pluto's Cthulhu Macula pink.
 */
export type ChromaCalibration = {
  readonly matrix: readonly [Vec2, Vec2];
  readonly gain: number;
};
