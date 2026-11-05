import type { Vec3 } from '../math/Vec3';
import type { ChromaCalibration } from './ChromaCalibration';
import type { ColourGrade } from './ColourGrade';

/**
 * ColourTreatment — how a body's raw albedo source becomes the sRGB texture the
 * build writes. `kind` is authored per body in `BODY_TEXTURE_REGISTRY` and
 * switched on exhaustively in `buildTextures`, whose `never` guard turns a new
 * variant into a compile error rather than a silent fall-through.
 * `monoTint` multiplies `tint` in ENCODED (gamma) space — where the tints were
 * calibrated by eye (`writeTintedMonoTier`), over the source's luminance (a
 * colour source is greyed first). `lift` adds afterward, same space: a stretched
 * mosaic of a bright body clips under any tint large enough to reach its albedo,
 * so the brightness is added instead. `antimeridianCentred` marks a source whose
 * centre column is longitude 180° (the CICLOPS Saturn-moon maps). `panSharpen`
 * takes luminance from the mono source and chroma from the map named by the
 * `TEXTURE_SOURCES` row's `chroma` key. `grade` applies a `ColourGrade` only,
 * no delighting — the base globe, whose photographic mosaic carries no
 * baked-in sun to remove.
 */
export type ColourTreatment =
  | { readonly kind: 'colour' }
  | {
      readonly kind: 'monoTint';
      readonly tint: Vec3;
      readonly lift?: number;
      readonly antimeridianCentred?: true;
    }
  | { readonly kind: 'panSharpen'; readonly calibration: ChromaCalibration }
  | { readonly kind: 'grade'; readonly grade: ColourGrade };
