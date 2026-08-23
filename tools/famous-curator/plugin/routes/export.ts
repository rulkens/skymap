/**
 * /api/export — write the five committed artefacts + recipe.json for a
 * curated galaxy.  Atomic: stage everything to
 *
 *   <outDir>/.tmp/{source,starless,full,atlas,thumb}.webp + recipe.json
 *
 * then `rm -rf <outDir>/` (if it exists) and `rename(.tmp/, outDir/)`.
 * If anything throws before the rename, the .tmp/ dir is left behind
 * for inspection; the previous outDir/ is untouched.  If the rename
 * succeeds, callers see the new contents in full or not at all.
 *
 * Why a sibling-staging rename rather than rename-in-place?
 *   curatedTmpDir returns `<outDir>/.tmp` — i.e., a child of outDir.
 *   If we renamed .tmp/ → outDir/ while outDir/ still exists we'd be
 *   trying to move a directory into itself.  Instead we:
 *     1. rename .tmp/ → <parentDir>/.staging-<id>-<ts>/  (sibling of outDir)
 *     2. rmSync outDir/ if present
 *     3. rename sibling-staging → outDir/
 *   Steps 2 and 3 are not globally atomic, but a half-complete outDir/
 *   is fine: on re-export the rm will wipe it and the rename will
 *   succeed.  The important invariant is that partial WebPs never sit
 *   inside an otherwise-complete outDir/ — that's what the sibling
 *   staging dir guarantees.
 *
 * Encoder settings match the spec's Output Layout:
 *   source.webp   lossless WebP — full-res crop, no quality loss
 *   starless.webp lossless WebP — post-StarNet, no quality loss
 *   full.webp     lossy WebP q92, 1024² with soft alpha
 *   atlas.webp    lossy WebP q82, 256² with soft alpha
 *   thumb.webp    lossy WebP q82, 256² — the NON-deprojected InfoCard tile,
 *                 re-extracted from source.png at true on-sky inclination
 *                 with its own StarNet pass (see step 6b)
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curatedGalaxyDir, curatedTmpDir, overrideIndexPath } from '../paths.ts';
import { sessionPath } from '../tmpSession.ts';
import { serialiseRecipe, validateRecipeDisk, type Recipe, type RecipeDisk } from '../recipe.ts';
import { upsertOverrideEntry, type OverrideIndex } from '../overrideIndex.ts';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.ts';
import { willDeproject } from '../../../famous/deprojectDisk.ts';
import { squareDeprojectCrop } from '../../../famous/squareDeprojectCrop.ts';
import { deriveFamousCalibration } from '../../../famous/deriveFamousCalibration.ts';
import { publishFamousRuntimeImages } from '../../../famous/publishFamousRuntimeImages.ts';
import { buildThumbTile } from '../../../famous/buildThumbTile.ts';
import { type StarnetConfig } from '../starnet.ts';
import type { FamousCalibration } from '../../../../src/@types/loading/FamousCalibration';

const FULL_PX = 1024;
const ATLAS_PX = 256;

export type ExportBody = {
  id: string;
  tmpId: string;
  crop: { x: number; y: number; width: number; height: number; rotationDeg: number };
  starnet: { stride: number; upsample: boolean };
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
  metadata: { sourceUrl: string; license: string; author: string };
  /** Disk-overlay geometry annotation drawn in the curator UI. */
  disk?: RecipeDisk;
  /**
   * Catalog-derived axis ratio (b/a) for this galaxy — consumed by the
   * calibration-derivation step to compute a face-on correction
   * factor.  Has no effect on the written recipe.
   */
  catalogAxisRatio?: number;
};

export type ExportResult = {
  paths: {
    source: string;
    starless: string;
    full: string;
    atlas: string;
    thumb: string;
    recipe: string;
  };
  overrideIndex: OverrideIndex;
  /** Present when a disk annotation was supplied; absent otherwise. */
  calibration?: FamousCalibration;
};

export async function handleExport(opts: {
  body: ExportBody;
  repoRoot: string;
  /** StarNet config for the thumb's pre-deproject pass (mock in tests). */
  starnetConfig: StarnetConfig;
  /** Test hook — defaults to sessionPath(body.tmpId). */
  sessionDirOverride?: string;
}): Promise<ExportResult> {
  const { body, repoRoot, starnetConfig } = opts;
  // `sessDir` holds source.png + starless.png written by /api/process.
  // `sessionDirOverride` lets tests inject an arbitrary tmpdir without
  // needing the OS's $TMPDIR/famous-curator/ tree to exist.
  const sessDir = opts.sessionDirOverride ?? sessionPath(body.tmpId);
  const outDir = curatedGalaxyDir(repoRoot, body.id);
  const tmpDir = curatedTmpDir(repoRoot, body.id);

  // 1. Prepare the staging directory.  Clean any leftover .tmp/ from a
  //    previously interrupted export — these are safe to discard because
  //    the previous outDir/ was left intact (see module comment).
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const sourcePath = resolve(sessDir, 'source.png');
  const croppedPath = resolve(sessDir, 'cropped.png');
  const starlessPath = resolve(sessDir, 'starless.png');

  // Source dimensions the crop + disk were authored against.  We read them from
  // the actual source.png bytes (the frame the crop coordinates reference)
  // rather than trusting a client-supplied value, so the recorded value is the
  // single source of truth.  Persisted in recipe.json to let the resume flow
  // rescale by the exact ratio when a later re-fetch returns a different size.
  const sourceMeta = await sharp(sourcePath).metadata();
  const source =
    sourceMeta.width !== undefined && sourceMeta.height !== undefined
      ? { width: sourceMeta.width, height: sourceMeta.height }
      : undefined;

  // Disk + deproject decision.  handleProcess already applied the deproject —
  // it stretches the crop to face-on BEFORE StarNet, so the cached cropped.png
  // (with stars) and starless.png (stars removed) are ALREADY in the committed
  // frame.  Export adds no geometry of its own; it only downsizes those buffers.
  // Re-running deprojectDisk here would Y-stretch the starless layer a second
  // time, so the shipped thumbnail would be more foreshortened than the 512²
  // preview — see tests/tools/famous-curator/export.registration.test.ts.
  //
  // We still compute `deprojected` + the normalised `extractionCrop` because the
  // runtime CALIBRATION (centre / radius / PA) must describe the shipped pixels,
  // which handleProcess framed with squareDeprojectCrop.  willDeproject
  // single-sources the gate (0 < b/a < 1) with handleProcess and deprojectDisk.
  const disk = body.disk !== undefined ? validateRecipeDisk(body.disk) : undefined;
  const effectiveAxisRatio = disk?.axisRatio ?? body.catalogAxisRatio;
  const wantsDeproject = disk?.deproject === true;
  const deprojected =
    wantsDeproject && effectiveAxisRatio !== undefined && willDeproject(effectiveAxisRatio);

  // The extraction crop is the square-snapped framing handleProcess used
  // (rotationDeg = disk.paDeg, height = width·(b/a)); see squareDeprojectCrop.
  // Calibration is derived from it so the runtime overlay matches the shipped
  // pixels.  The recipe below still records the maintainer's ORIGINAL body.crop
  // so a re-export reproduces the same normalisation from scratch.
  const extractionCrop =
    deprojected && disk !== undefined
      ? squareDeprojectCrop(body.crop, disk, effectiveAxisRatio!)
      : body.crop;

  // Derive calibration whenever a disk and an axis ratio are both available.
  // catalogAxisRatio falls back to disk.axisRatio so callers that omit it but
  // set disk.axisRatio still get a valid calibration — the curator always threads
  // catalogAxisRatio, but the fallback keeps the function total.
  // We feed the EXTRACTION crop (not body.crop) so the calibration's centre /
  // radius / PA frame matches the pixels we actually ship.
  const catalogAxisRatio = body.catalogAxisRatio ?? disk?.axisRatio;
  const calibration: FamousCalibration | undefined =
    disk !== undefined && catalogAxisRatio !== undefined
      ? deriveFamousCalibration({ disk, crop: extractionCrop, catalogAxisRatio, deprojected })
      : undefined;

  // 2. source.webp — the with-stars crop handleProcess cached (already
  //    deprojected when applicable), downsized to at most FULL_PX on the
  //    longest edge (`fit: 'inside'`), lossless.
  const sourceCropped = await sharp(croppedPath)
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'source.webp'), sourceCropped);

  // 3. starless.webp — the StarNet output handleProcess cached, in the SAME
  //    frame as cropped.png, downsized to FULL_PX and re-encoded lossless.
  //    Materialise the resized pixels once so all three downstream consumers —
  //    starless.webp, full.webp, atlas.webp — read from one buffer and stay
  //    exactly registered with source.webp.
  const starlessFullBuf = await sharp(starlessPath)
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .png()
    .toBuffer();
  const starlessOut = await sharp(starlessFullBuf).webp({ lossless: true }).toBuffer();
  writeFileSync(resolve(tmpDir, 'starless.webp'), starlessOut);

  // 4. Derive the alpha channel from the starless luminance at full
  //    resolution.  We always re-derive here (rather than reading
  //    alpha.webp from the session dir) because alpha.webp is 512²
  //    lossy — the alpha mask would be both downsampled and artifacted.
  //    Re-running applyLuminanceAsAlpha at full resolution gives a
  //    sharper mask at no cost beyond the decode/encode.
  //    We reuse the already-resized starlessFullBuf so no re-decode occurs
  //    and deproject/no-deproject paths stay consistent.
  const { data, info } = await sharp(starlessFullBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  applyLuminanceAsAlpha(rgba, info.width, info.height, body.alpha);

  // 5. full.webp — alpha-stamped, lossy q92.
  const fullOut = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 92, alphaQuality: 92 })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'full.webp'), fullOut);

  // 6. atlas.webp — same RGBA buffer downsampled to ATLAS_PX, q82.
  //    Lower quality is acceptable because the atlas slot is only
  //    256² — the quality difference between q82 and q92 is invisible
  //    at that scale, and the smaller file reduces cold-load latency
  //    for the initial pass that paints atlas thumbnails.
  const atlasOut = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(ATLAS_PX, ATLAS_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'atlas.webp'), atlasOut);

  // 6b. thumb.webp — the NON-deprojected InfoCard tile.  Every tier above is
  //     deprojected (Y-stretched face-on) so it re-projects onto the oriented
  //     billboard quad; shown flat in a card that stretch looks wrong.  So we
  //     re-extract the galaxy at its true on-sky inclination straight from
  //     source.png — the same `extractionCrop` framing the atlas/full cover,
  //     just WITHOUT the deproject stretch — and run its own StarNet pass.
  //
  //     This is a second StarNet pass (the first ran in handleProcess on the
  //     deprojected crop), deliberately at export rather than process time so
  //     the maintainer's re-process tuning loop stays cheap.  For a face-on
  //     disk extractionCrop == body.crop and the thumb matches the atlas.
  //     buildThumbTile is shared with the bulk backfill so both stay identical.
  const thumbOut = await buildThumbTile({
    sourcePath,
    extractionCrop,
    starnet: body.starnet,
    alpha: body.alpha,
    starnetConfig,
    workDir: tmpDir,
  });
  writeFileSync(resolve(tmpDir, 'thumb.webp'), thumbOut);

  // 7. recipe.json — provenance record for re-runs and auditing.
  //    `disk` was already validated above (throws on bad shape), so we
  //    reuse it directly rather than calling validateRecipeDisk again.
  const recipe: Recipe = {
    version: 1,
    id: body.id,
    crop: body.crop,
    starnet: body.starnet,
    alpha: body.alpha,
    metadata: body.metadata,
    processedAt: new Date().toISOString(),
    ...(source !== undefined ? { source } : {}),
    ...(disk !== undefined ? { disk } : {}),
  };
  writeFileSync(resolve(tmpDir, 'recipe.json'), serialiseRecipe(recipe));

  // 8. Atomic swap: move everything into place.
  //    tmpDir is <outDir>/.tmp — a child of outDir.  We can't rename a
  //    child to its parent, so we first move .tmp/ to a sibling of
  //    outDir/ (same filesystem → rename is a metadata-only operation),
  //    then blow away the old outDir/, then rename the sibling into its
  //    final position.  The sibling name includes a timestamp to avoid
  //    collisions if two simultaneous exports somehow race (unlikely but
  //    harmless).
  const parentDir = resolve(outDir, '..');
  const siblingStaging = resolve(parentDir, `.staging-${body.id}-${Date.now()}`);
  renameSync(tmpDir, siblingStaging);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  renameSync(siblingStaging, outDir);

  // 9. Publish BOTH runtime tiers so the app reflects this Commit completely:
  //    the 256² atlas → public/images/famous/<id>.webp (low-res slot) and the
  //    1024² full → public/data/images/famous-hires/<id>.webp (hi-res slot).
  //    publishFamousRuntimeImages is the single source of truth for that layout
  //    (the bulk copyHiResToPublic step uses the same primitive).  A Commit must
  //    refresh both tiers: refreshing only the low-res tile would leave close-up
  //    views serving a stale hi-res render until a manual `build-famous-hires`.
  publishFamousRuntimeImages({ repoRoot, id: body.id });

  // 10. Update the override index so the build pipeline picks this
  //     galaxy up without a manual JSON edit.
  const idx = upsertOverrideEntry(overrideIndexPath(repoRoot), body.id, {
    dir: `famous-curated/${body.id}`,
    sourceUrl: body.metadata.sourceUrl,
    license: body.metadata.license,
    author: body.metadata.author,
    processedAt: recipe.processedAt,
  });

  return {
    paths: {
      source: resolve(outDir, 'source.webp'),
      starless: resolve(outDir, 'starless.webp'),
      full: resolve(outDir, 'full.webp'),
      atlas: resolve(outDir, 'atlas.webp'),
      thumb: resolve(outDir, 'thumb.webp'),
      recipe: resolve(outDir, 'recipe.json'),
    },
    overrideIndex: idx,
    ...(calibration !== undefined ? { calibration } : {}),
  };
}
