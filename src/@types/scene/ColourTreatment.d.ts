import type { Vec3 } from '../math/Vec3';
import type { ChromaCalibration } from './ChromaCalibration';

/**
 * ColourTreatment — how a body's raw albedo source becomes the sRGB texture the
 * build writes. `kind` is authored per body in `BODY_TEXTURE_REGISTRY` and
 * switched on exhaustively in `buildTextures`, whose `never` guard turns a new
 * variant into a compile error rather than a silent fall-through.
 * `monoTint` multiplies `tint` in ENCODED (gamma) space — where the tints were
 * calibrated by eye (`writeTintedMonoTier`). `panSharpen` takes luminance from
 * the mono source and chroma from the map named by the `TEXTURE_SOURCES` row's
 * `chroma` key.
 */
export type ColourTreatment =
  | { readonly kind: 'colour' }
  | { readonly kind: 'monoTint'; readonly tint: Vec3 }
  | { readonly kind: 'panSharpen'; readonly calibration: ChromaCalibration };
