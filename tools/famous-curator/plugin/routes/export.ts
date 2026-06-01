/**
 * /api/export — write the four committed artefacts + recipe.json for a
 * curated galaxy.  Atomic: stage everything to
 *
 *   <outDir>/.tmp/{source,starless,full,atlas}.webp + recipe.json
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
 */
import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curatedGalaxyDir, curatedTmpDir, overrideIndexPath } from '../paths.js';
import { sessionPath } from '../tmpSession.js';
import { serialiseRecipe, validateRecipeDisk, type Recipe, type RecipeDisk } from '../recipe.js';
import { upsertOverrideEntry, type OverrideIndex } from '../overrideIndex.js';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.js';
import { rotatedExtract } from '../cropExtract.js';
import { deprojectDisk, willDeproject } from '../../../famous/deprojectDisk.js';
import { squareDeprojectCrop } from '../../../famous/squareDeprojectCrop.js';
import { deriveFamousCalibration } from '../../../famous/deriveFamousCalibration.js';
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
   * calibration-derivation step (later task) to compute a face-on
   * correction factor.  Has no effect on the written recipe.
   */
  catalogAxisRatio?: number;
};

export type ExportResult = {
  paths: {
    source: string;
    starless: string;
    full: string;
    atlas: string;
    recipe: string;
  };
  overrideIndex: OverrideIndex;
  /** Present when a disk annotation was supplied; absent otherwise. */
  calibration?: FamousCalibration;
};

export async function handleExport(opts: {
  body: ExportBody;
  repoRoot: string;
  /** Test hook — defaults to sessionPath(body.tmpId). */
  sessionDirOverride?: string;
}): Promise<ExportResult> {
  const { body, repoRoot } = opts;
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
  const starlessPath = resolve(sessDir, 'starless.png');

  // 2. source.webp — full-resolution crop, lossless.
  //    Resize to at most FULL_PX on the longest edge (`fit: 'inside'`)
  //    so non-square crops aren't distorted.  rotatedExtract handles
  //    rotation + out-of-image padding (transparent fill).
  //
  //    Frame reasoning: rotatedExtract rotates the source by -crop.rotationDeg,
  //    so the returned pipeline is in the CROP's local frame.  disk.paDeg is in
  //    the SOURCE frame, so we subtract rotationDeg to get the effective PA
  //    inside the crop.  sin²/cos² are 180-periodic, so normalization is
  //    optional, but we skip it to keep the value directly interpretable.
  //
  //    Starless frame: starless.png was produced by handleProcess, which runs
  //    rotatedExtract → StarNet → starless.png.  It is therefore already in the
  //    CROP frame — the same frame as the source pipeline here.  Both use the
  //    same effectivePaDeg.
  const disk = body.disk !== undefined ? validateRecipeDisk(body.disk) : undefined;
  const effectiveAxisRatio = disk?.axisRatio ?? body.catalogAxisRatio;
  const wantsDeproject = disk?.deproject === true;
  // The webp is deprojected whenever the maintainer asked AND the effective
  // axis ratio is a tilted, valid disk (0 < b/a < 1) — single-sourced with
  // deprojectDisk's own guard via willDeproject.  A forced toggle on a very
  // edge-on disk still deprojects; the only skip is when there is nothing to
  // stretch (b/a >= 1) or no axis ratio at all.
  const deprojected =
    wantsDeproject && effectiveAxisRatio !== undefined && willDeproject(effectiveAxisRatio);

  // Extraction crop vs annotation crop.  When deprojecting, we snap the crop
  // onto the geometry that makes the downstream stretch land on a square
  // (rotationDeg = disk.paDeg, height = width·(b/a)); see squareDeprojectCrop.
  // This normalised crop is what gets EXTRACTED and what calibration is derived
  // from, so the runtime overlay matches the shipped pixels.  The recipe below
  // still records the maintainer's ORIGINAL body.crop — the source-of-truth
  // annotation — so a re-export reproduces the same normalisation from scratch.
  const extractionCrop =
    deprojected && disk !== undefined
      ? squareDeprojectCrop(body.crop, disk, effectiveAxisRatio!)
      : body.crop;

  // effectivePaDeg is the disk PA inside the extraction crop's frame.
  // rotatedExtract rotates the source by -extractionCrop.rotationDeg, so the
  // crop-frame PA is disk.paDeg - extractionCrop.rotationDeg.  After the
  // square-snap the extraction crop's rotationDeg == disk.paDeg, so this
  // collapses to 0 and deprojectDisk applies the pure image-Y stretch that
  // yields a square.
  const effectivePaDeg = disk !== undefined ? disk.paDeg - extractionCrop.rotationDeg : 0;

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

  const sourcePipeline = await rotatedExtract(sourcePath, extractionCrop);
  // Deproject the hi-res crop to face-on before downsize so the extra resolution
  // along the stretch direction is preserved in the final thumbnail.
  const maybeDeprojectedSource = deprojected
    ? deprojectDisk(sourcePipeline, { paDeg: effectivePaDeg, axisRatio: effectiveAxisRatio! })
    : sourcePipeline;
  const sourceCropped = await maybeDeprojectedSource
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'source.webp'), sourceCropped);

  // 3. starless.webp — post-StarNet at full resolution, lossless.
  //    Starless is in the CROP frame (see frame reasoning above) — same
  //    effectivePaDeg applies.  We deproject once to a buffer and reuse
  //    it for both starless.webp and the alpha derivation so all three
  //    outputs remain pixel-registered.
  const starlessPipeline = deprojected
    ? deprojectDisk(sharp(starlessPath), { paDeg: effectivePaDeg, axisRatio: effectiveAxisRatio! })
    : sharp(starlessPath);
  // Materialise the (possibly deprojected) starless pixels once.  All three
  // downstream consumers — starless.webp, full.webp, atlas.webp — read from
  // this buffer, so source/starless/alpha stay exactly registered.
  const starlessFullBuf = await starlessPipeline
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

  // 9. Copy atlas.webp into the runtime atlas slot so the main app
  //    picks up the new thumbnail without an extra fetch-famous-images
  //    run.  The runtime fetcher loads `/images/famous/<id>.webp`
  //    directly (see src/utils/network/galaxyImageFetcher.ts); leaving
  //    this step out means a Commit "succeeds" but the main app still
  //    shows the previous thumbnail until a manual copy.
  const atlasSrc = resolve(outDir, 'atlas.webp');
  const atlasRuntimeDir = resolve(repoRoot, 'public/images/famous');
  // mkdir -p in case the runtime slot dir doesn't exist yet (fresh
  // clones + test fixtures both hit this — production checkouts already
  // have it populated by fetch-famous-images).
  mkdirSync(atlasRuntimeDir, { recursive: true });
  copyFileSync(atlasSrc, resolve(atlasRuntimeDir, `${body.id}.webp`));

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
      recipe: resolve(outDir, 'recipe.json'),
    },
    overrideIndex: idx,
    ...(calibration !== undefined ? { calibration } : {}),
  };
}
