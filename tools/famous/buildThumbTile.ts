/**
 * buildThumbTile — build the NON-deprojected InfoCard tile (thumb.webp).
 *
 * The atlas/full tiers are deprojected (Y-stretched to face-on) so they
 * re-project onto the oriented billboard quad; shown flat in an InfoCard that
 * stretch looks wrong.  This builds the galaxy at its true on-sky inclination:
 * extract the natural-inclination crop from `source`, run StarNet to strip
 * stars, stamp luminance-as-alpha, and downsize to a square-bounded WebP that
 * KEEPS the crop's aspect (a 2:1 crop ships a 2:1 tile).
 *
 * Shared by both producers so they stay byte-consistent: the curator export
 * (per-galaxy Commit, source.png in the session dir) and the bulk thumb
 * backfill (re-fetched original).  StarNet needs file paths, so the caller
 * supplies a `workDir` for the two intermediate PNGs; we remove them before
 * returning so they never linger in a committed dir.
 *
 * Returns the encoded thumb.webp bytes; the caller decides where to write.
 */
import sharp from 'sharp';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { rotatedExtract, type RotatedCrop } from '../famous-curator/plugin/cropExtract.ts';
import { runStarnet, type StarnetConfig } from '../famous-curator/plugin/starnet.ts';
import { applyLuminanceAsAlpha } from '../utils/image/applyLuminanceAsAlpha.ts';
import type { LuminanceAsAlphaOptions } from '../utils/image/LuminanceAsAlphaOptions';

// StarNet working size, applied to the SHORTER edge (fit: 'outside').  A
// foreshortened crop (e.g. an edge-on disk at b/a≈0.4 → ~2.5:1) must still
// clear StarNet's ~256 px input window on its short side, so we size the short
// edge — `fit: 'inside'` would cap the long edge and starve the short one,
// which StarNet rejects with "Image size is too small for the window".
export const THUMB_WORK_PX = 512;
// Committed slot: 256² square bound, aspect preserved (a 2.5:1 crop → 256×102).
export const THUMB_PX = 256;

export async function buildThumbTile(opts: {
  /** Source image the crop coordinates reference (any sharp-readable file). */
  sourcePath: string;
  /** Pre-deproject, natural-inclination crop (== atlas framing, minus stretch). */
  extractionCrop: RotatedCrop;
  starnet: { stride: number; upsample: boolean };
  alpha: LuminanceAsAlphaOptions;
  starnetConfig: StarnetConfig;
  /** Scratch dir for the two intermediate PNGs StarNet reads/writes. */
  workDir: string;
}): Promise<Buffer> {
  const cropPath = join(opts.workDir, 'thumb-crop.png');
  const starlessPath = join(opts.workDir, 'thumb-starless.png');

  const extract = await rotatedExtract(opts.sourcePath, opts.extractionCrop);
  // `fit: 'outside'` → both dims ≥ THUMB_WORK_PX (short edge == it), keeping the
  // crop's aspect.  Flatten onto black: rotated/out-of-bounds crops carry
  // transparent corners, and StarNet wants opaque RGB input.
  await extract
    .resize(THUMB_WORK_PX, THUMB_WORK_PX, { fit: 'outside' })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png()
    .toFile(cropPath);

  await runStarnet({
    input: cropPath,
    output: starlessPath,
    stride: opts.starnet.stride,
    upsample: opts.starnet.upsample,
    config: opts.starnetConfig,
  });

  const { data, info } = await sharp(starlessPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  applyLuminanceAsAlpha(rgba, info.width, info.height, opts.alpha);

  const out = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(THUMB_PX, THUMB_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();

  rmSync(cropPath, { force: true });
  rmSync(starlessPath, { force: true });
  return out;
}
