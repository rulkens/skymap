import type { Vec3 } from '../math/Vec3';
import type { ChromaCalibration } from './ChromaCalibration';

/**
 * ColourTreatment — how a body's raw albedo source becomes the sRGB texture the
 * build writes. `kind` is the discriminant: authored per body in
 * `BODY_TEXTURE_REGISTRY`, switched on exhaustively in `buildTextures`.
 *
 * `monoTint` band-expands a single-channel USGS mosaic and multiplies `tint` in
 * ENCODED (gamma) space, which is where the tints were calibrated by eye
 * (`writeTintedMonoTier`). `panSharpen` takes luminance from the mono source and
 * chroma from the map named by the `TEXTURE_SOURCES` row's `chroma` key, undoing
 * that map's published enhancement via `calibration`.
 */
export type ColourTreatment =
  | { readonly kind: 'colour' }
  | { readonly kind: 'monoTint'; readonly tint: Vec3 }
  | { readonly kind: 'panSharpen'; readonly calibration: ChromaCalibration };
