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
import { existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  curatedGalaxyDir,
  curatedTmpDir,
  overrideIndexPath,
} from '../paths.js';
import { sessionPath } from '../tmpSession.js';
import { serialiseRecipe, type Recipe } from '../recipe.js';
import { upsertOverrideEntry, type OverrideIndex } from '../overrideIndex.js';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.js';
import { rotatedExtract } from '../cropExtract.js';

const FULL_PX = 1024;
const ATLAS_PX = 256;

export type ExportBody = {
  id: string;
  tmpId: string;
  crop: { x: number; y: number; width: number; height: number; rotationDeg: number };
  starnet: { stride: number; upsample: boolean };
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
  metadata: { sourceUrl: string; license: string; author: string };
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
  const sourcePipeline = await rotatedExtract(sourcePath, body.crop);
  const sourceCropped = await sourcePipeline
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'source.webp'), sourceCropped);

  // 3. starless.webp — post-StarNet at full resolution, lossless.
  const starlessOut = await sharp(starlessPath)
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'starless.webp'), starlessOut);

  // 4. Derive the alpha channel from the starless luminance at full
  //    resolution.  We always re-derive here (rather than reading
  //    alpha.webp from the session dir) because alpha.webp is 512²
  //    lossy — the alpha mask would be both downsampled and artifacted.
  //    Re-running applyLuminanceAsAlpha at full resolution gives a
  //    sharper mask at no cost beyond the decode/encode.
  const { data, info } = await sharp(starlessPath)
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
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
  const recipe: Recipe = {
    version: 1,
    id: body.id,
    crop: body.crop,
    starnet: body.starnet,
    alpha: body.alpha,
    metadata: body.metadata,
    processedAt: new Date().toISOString(),
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

  // 9. Update the override index so the build pipeline picks this
  //    galaxy up without a manual JSON edit.
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
  };
}
