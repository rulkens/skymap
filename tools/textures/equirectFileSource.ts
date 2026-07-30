/**
 * equirectFileSource — an `EarthImagerySource` over a whole-globe
 * equirectangular image already sitting in `data/raw/`.
 *
 * This is the development pyramid's source: no download, no external service,
 * no answer needed to the still-open question of which deep imagery source the
 * shipped pyramid is baked from. It produces a real, correctly-addressed
 * pyramid from real imagery, which is all the runtime needs in order to be
 * built and visually verified. The deep sources that replace it later are a
 * different `readBox` and nothing else.
 *
 * ## Why `maxLevel` is derived rather than declared
 *
 * The deepest honest level is a property of the file on disk: pyramid level
 * `z` has a full equirect width of `EARTH_EQUIRECT_BASE_WIDTH_PX << z`, so the
 * deepest level a source can produce without inventing detail is the largest
 * `z` whose width still fits inside the source's own — `earthLevelFittingWidth`.
 * Blue Marble at 21600 px gives z5 (16384, a genuine downsample); z6 would be
 * 32768 and would be upscaling a photograph. Deriving that from the file rather
 * than writing 5 in a constant means swapping in a wider equirect deepens the
 * bake by itself, and means a narrower one cannot silently start upscaling.
 *
 * ## Why the crop re-reads the file per box
 *
 * The obvious alternative is to decode the source once into memory and slice
 * it. For Blue Marble that is a 700 MB resident raster, and it is measurably
 * not worth it: libvips reads a JPEG region-of-interest without materialising
 * the whole image, so a 675 x 675 crop out of the 21600 x 10800 source costs
 * about 170 ms — under two minutes for a whole z5 level, against holding
 * two thirds of a gigabyte for the duration of the bake. Nothing here ever
 * holds a whole-globe raster, which is the same property the build loop's
 * deepest-level-first ordering exists to preserve.
 */

import sharp from 'sharp';

import { earthLevelFittingWidth } from '../../src/utils/scene/earthLevelFittingWidth';
import { rawDataPath, type RawDataKey } from '../utils/io/rawDataRegistry';
import type { EarthImagerySource } from './EarthImagerySource';

export async function equirectFileSource(source: {
  /** Stable identifier recorded in the manifest's `builtFrom`, vintage included. */
  readonly id: string;
  /** Registry key for the equirect on disk — never a literal `data/raw/...` path. */
  readonly rawKey: RawDataKey;
  /** Verbatim attribution the licence requires. */
  readonly attribution: string;
}): Promise<EarthImagerySource> {
  const path = rawDataPath(source.rawKey);
  const meta = await sharp(path, { limitInputPixels: false }).metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;

  // A 2:1 raster is what makes 'pixel row = latitude' a linear map. Anything
  // else is not a plate-carree whole-globe equirect, and every box this source
  // returns would be silently sampling the wrong ground.
  if (sourceWidth !== sourceHeight * 2) {
    throw new Error(
      `equirectFileSource: ${source.rawKey} is ${sourceWidth}x${sourceHeight}, not a 2:1 equirectangular raster`,
    );
  }

  return {
    id: source.id,
    attribution: source.attribution,
    maxLevel: earthLevelFittingWidth(sourceWidth),

    async readBox(box, widthPx, heightPx) {
      // Row 0 of the source is latitude +90, so the box's NORTH edge maps to
      // the smaller pixel row and the returned raster is north-first — which
      // is exactly what the tile contract asks for.
      const left = Math.round(((box.west + 180) / 360) * sourceWidth);
      const right = Math.round(((box.east + 180) / 360) * sourceWidth);
      const top = Math.round(((90 - box.north) / 180) * sourceHeight);
      const bottom = Math.round(((90 - box.south) / 180) * sourceHeight);

      const raster = await sharp(path, { limitInputPixels: false })
        .extract({
          left,
          top,
          width: Math.min(right, sourceWidth) - left,
          height: Math.min(bottom, sourceHeight) - top,
        })
        // `fit: 'fill'` because the caller asks for a square tile out of a box
        // that is only square at the equator; the plate-carree stretch toward
        // the poles is the projection, not an aspect error to preserve.
        .resize(widthPx, heightPx, { fit: 'fill' })
        // Blue Marble covers the whole globe and has no no-data, so alpha is
        // 255 everywhere and this source never declines a box. Both the alpha
        // channel and `readBox`'s null return exist for the land-only sources
        // of the deep pyramid, whose no-data mask IS the coastline.
        .ensureAlpha()
        .raw()
        .toBuffer();

      return raster;
    },
  };
}
