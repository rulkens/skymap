import type { Vec3 } from '../math/Vec3';
import type { ChromaCalibration } from './ChromaCalibration';

/**
 * ColourTreatment — how a body's raw albedo source becomes the sRGB texture the
 * build writes. The `kind` tag IS the discriminant: authored per body in
 * `BODY_TEXTURE_REGISTRY` and switched on exhaustively in `buildTextures`, so a
 * further treatment is one variant plus one case, never a marker field whose
 * absence a reader has to read as a second treatment.
 *
 * `monoTint` covers the USGS single-channel mosaics, which carry no hue at all:
 * the build band-expands the source and multiplies `tint` in — in ENCODED (gamma)
 * space, which is where the tints were calibrated by eye (`writeTintedMonoTier`).
 *
 * `panSharpen` covers a body that has BOTH a high-resolution panchromatic mosaic
 * and a lower-resolution colour map: luminance comes from the mono source, chroma
 * from the colour map named by the build's `TEXTURE_SOURCES` row (`chroma`), with
 * the colour map's published enhancement undone by `calibration`.
 */
export type ColourTreatment =
  | { readonly kind: 'colour' }
  | { readonly kind: 'monoTint'; readonly tint: Vec3 }
  | { readonly kind: 'panSharpen'; readonly calibration: ChromaCalibration };
