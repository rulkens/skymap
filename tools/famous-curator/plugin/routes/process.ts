/**
 * /api/process — crop the cached source, run StarNet on the cropped
 * region, apply the alpha pass, and write three intermediates:
 *
 *   starless.png   — full resolution, post-StarNet (input to alpha
 *                    pass + cached for /api/process/alpha-only)
 *   starless.webp  — 512² preview
 *   alpha.webp     — 512² preview with alpha channel
 *
 * The full-resolution `full.webp` + `atlas.webp` are NOT written here
 * — those are computed at Export time so re-Process cycles don't pay
 * the encode cost for files the maintainer hasn't committed to yet.
 *
 * `sessionDirOverride` lets tests substitute a fixture root for
 * sessionPath(tmpId); production callers omit it.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sessionPath } from '../tmpSession.ts';
import { runStarnet, type StarnetConfig } from '../starnet.ts';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.ts';
import { rotatedExtract } from '../cropExtract.ts';
import { deprojectDisk, willDeproject } from '../../../famous/deprojectDisk.ts';
import { squareDeprojectCrop } from '../../../famous/squareDeprojectCrop.ts';
import { validateRecipeDisk, type RecipeDisk } from '../recipe.ts';

const PREVIEW_PX = 512;

export type ProcessBody = {
  tmpId: string;
  crop: { x: number; y: number; width: number; height: number; rotationDeg: number };
  starnet: { stride: number; upsample: boolean };
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
  /**
   * Disk-overlay geometry annotation drawn in the curator UI.  When present
   * the preview pipeline applies the same deproject logic as the export route,
   * so the starless preview reflects the geometry the maintainer will commit.
   * Mirrors the export route so preview == committed geometry.
   */
  disk?: RecipeDisk;
  /**
   * Catalog-derived axis ratio (b/a) for this galaxy — falls back to
   * disk.axisRatio when absent (same fallback chain as export.ts).
   */
  catalogAxisRatio?: number;
};

export type ProcessResult = {
  starlessPreviewUrl: string;
  alphaPreviewUrl: string;
};

export async function handleProcess(opts: {
  body: ProcessBody;
  starnetConfig: StarnetConfig;
  /** Test hook — defaults to sessionPath(tmpId). */
  sessionDirOverride?: string;
}): Promise<ProcessResult> {
  const { body } = opts;
  // `dir` is the canonical session directory for this request.  In
  // production it is derived from the tmpId (which encodes where the
  // OS placed the tmp tree); in tests it is an injected mkdtempSync
  // directory.  All file I/O below resolves paths relative to `dir`
  // directly — we never call sessionFilePath() — so the handler is
  // honest and testable with any injected root.
  const dir = opts.sessionDirOverride ?? sessionPath(body.tmpId);
  const sourcePath = resolve(dir, 'source.png');
  const croppedPath = resolve(dir, 'cropped.png');
  const starlessPath = resolve(dir, 'starless.png');

  // 1. Crop the full-resolution source.  `rotatedExtract` handles the
  //    happy path (rotation=0, in-bounds rect) and the relaxed cases:
  //    rotated rect, out-of-image rect (transparent fill).
  //
  //    Deproject logic mirrors export.ts exactly so the starless preview
  //    reflects the same geometry the maintainer will commit: derive the disk
  //    and the deproject flag, square-snap the extraction crop, then extract.
  //    effectivePaDeg is disk.paDeg measured in the extraction crop's frame —
  //    rotatedExtract rotates the image by -extractionCrop.rotationDeg.
  const disk = body.disk !== undefined ? validateRecipeDisk(body.disk) : undefined;
  const effectiveAxisRatio = disk?.axisRatio ?? body.catalogAxisRatio;
  const wantsDeproject = disk?.deproject === true;
  const deprojected =
    wantsDeproject && effectiveAxisRatio !== undefined && willDeproject(effectiveAxisRatio);

  // Square-snap the extraction crop when deprojecting so the preview matches
  // the square geometry the export route will commit (rotationDeg = disk.paDeg,
  // height = width·(b/a); see squareDeprojectCrop).  The as-shot path uses
  // body.crop verbatim.  We extract from this normalised crop so the starless
  // preview reflects the committed framing, not the raw annotation rect.
  const extractionCrop =
    deprojected && disk !== undefined
      ? squareDeprojectCrop(body.crop, disk, effectiveAxisRatio!)
      : body.crop;
  // After the square-snap, extractionCrop.rotationDeg == disk.paDeg, so this
  // collapses to 0 — the pure image-Y stretch that yields a square.
  const effectivePaDeg = disk !== undefined ? disk.paDeg - extractionCrop.rotationDeg : 0;

  const pipeline = await rotatedExtract(sourcePath, extractionCrop);
  // willDeproject gates the stretch to a tilted, valid disk (0 < b/a < 1), so a
  // forced toggle on a very edge-on disk is honored here too — preview matches
  // the committed geometry.  No console.warn here: export.ts owns user-facing
  // warnings, and a per-preview log would flood the terminal on every drag.
  const deprojectedPipeline = deprojected
    ? deprojectDisk(pipeline, { paDeg: effectivePaDeg, axisRatio: effectiveAxisRatio! })
    : pipeline;
  const cropped = await deprojectedPipeline.png().toBuffer();
  writeFileSync(croppedPath, cropped);

  // 2. StarNet (or mock copy).  The mock copies input → output verbatim,
  //    so the downstream alpha pass still runs — the result just looks
  //    like the original (no stars removed).  That's fine for tests that
  //    are asserting on disk artefacts and alpha-pass behaviour.
  await runStarnet({
    input: croppedPath,
    output: starlessPath,
    stride: body.starnet.stride,
    upsample: body.starnet.upsample,
    config: opts.starnetConfig,
  });

  // 3. Apply luminance-as-alpha to the starless PNG.  We work at full
  //    resolution so the alpha mask is sharp; the preview is generated by
  //    downscaling the alpha'd buffer at the end.  We need raw RGBA bytes
  //    because applyLuminanceAsAlpha operates on a Uint8ClampedArray.
  const { data, info } = await sharp(starlessPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  applyLuminanceAsAlpha(rgba, info.width, info.height, body.alpha);

  // 4. Encode previews — starless (no alpha pass applied, so the
  //    maintainer can compare before/after) and alpha (post-pass).
  //
  //    We scale to PREVIEW_PX only on the longest edge (`fit: 'inside'`)
  //    so aspect ratio is preserved for non-square crops.  Quality 85
  //    for the opaque starless, 82 + alphaQuality 90 for the alpha WebP.
  const starlessPreview = await sharp(starlessPath)
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 85 })
    .toBuffer();
  writeFileSync(resolve(dir, 'starless.webp'), starlessPreview);

  const alphaPreview = await sharp(Buffer.from(rgba.buffer), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(resolve(dir, 'alpha.webp'), alphaPreview);

  // ?v=<ms> cache-busts the previews — re-Processing rewrites the same
  // URL with different bytes, and the browser would otherwise serve the
  // stale image from cache.
  const v = Date.now();
  return {
    starlessPreviewUrl: `/api/preview/${body.tmpId}/starless.webp?v=${v}`,
    alphaPreviewUrl: `/api/preview/${body.tmpId}/alpha.webp?v=${v}`,
  };
}
