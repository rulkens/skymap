/**
 * equirectFileSource — an `EarthImagerySource` over a whole-globe
 * equirectangular image already sitting in `data/raw/`. The `--dev` pyramid
 * source: no download, no external service — a real, correctly-addressed
 * pyramid good enough to build and visually verify against.
 *
 * `maxLevel` is derived, not declared: the deepest honest level is the
 * largest `z` whose full equirect width (`earthLevelFittingWidth`) still
 * fits the source's own — Blue Marble at 21600 px gives z5 (16384, a genuine
 * downsample); z6 (32768) would upscale a photograph.
 *
 * The crop re-reads the file per box rather than decoding once into memory
 * (700 MB resident for Blue Marble): libvips reads a JPEG region-of-interest
 * without materialising the whole image, so a crop costs ~170 ms — under two
 * minutes for a whole z5 level, and nothing here ever holds a whole-globe
 * raster.
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
  /** Human-readable vintage, folded with `id`/`attribution` into `provenance`. */
  readonly vintage: string;
}): Promise<EarthImagerySource> {
  const path = rawDataPath(source.rawKey);
  const meta = await sharp(path, { limitInputPixels: false }).metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;

  // A 2:1 raster makes 'pixel row = latitude' a linear map; anything else
  // isn't a plate-carree whole-globe equirect.
  if (sourceWidth !== sourceHeight * 2) {
    throw new Error(
      `equirectFileSource: ${source.rawKey} is ${sourceWidth}x${sourceHeight}, not a 2:1 equirectangular raster`,
    );
  }

  return {
    id: source.id,
    attribution: source.attribution,
    maxLevel: earthLevelFittingWidth(sourceWidth),
    coverage: [{ west: -180, south: -90, east: 180, north: 90 }],
    provenance: { sourceId: source.id, attribution: source.attribution, vintage: source.vintage },

    async readBox(box, widthPx, heightPx) {
      // Row 0 of the source is latitude +90, so the box's NORTH edge maps to
      // the smaller pixel row and the raster comes back north-first.
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
        // `fit: 'fill'`: the plate-carree stretch toward the poles is the
        // projection, not an aspect error to preserve.
        .resize(widthPx, heightPx, { fit: 'fill' })
        // Blue Marble has no no-data — this source never declines a box, but
        // still returns the alpha channel (see EarthImagerySource).
        .ensureAlpha()
        .raw()
        .toBuffer();

      return raster;
    },
  };
}
