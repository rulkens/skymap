#!/usr/bin/env node
/**
 * buildFamousThumbs — backfill the non-deprojected InfoCard tile (thumb.webp)
 * for galaxies curated before the export route emitted one.
 *
 * ── Why a backfill exists ──────────────────────────────────────────────
 *
 * thumb.webp is built from the PRE-deproject pixels (the galaxy at its true
 * on-sky inclination).  Every committed master tier (source/starless/full/
 * atlas) is ALREADY deprojected, and the original un-stretched pixels lived
 * only in the curator's ephemeral session.  So the pre-export galaxies can't
 * have a thumb derived locally — we must re-fetch the original image and redo
 * the natural-inclination crop + StarNet.
 *
 * ── How ────────────────────────────────────────────────────────────────
 *
 * For each public/images/famous-curated/<id>/recipe.json:
 *   1. resolveFamousSourceUrl(recipe.metadata.sourceUrl) → a fetchable URL
 *      (Wikipedia page fragments resolve via Special:FilePath; unresolvable
 *      sources are skipped + logged).
 *   2. fetchWithCache(...) — persists to data/raw/famous/source-cache/ so a
 *      rerun is offline.
 *   3. Rescale the recipe crop/disk if the re-fetched image differs in size
 *      from recipe.source (an upstream file was replaced since curation).
 *   4. Reconstruct the SAME extractionCrop the export route uses
 *      (squareDeprojectCrop when deprojected), then buildThumbTile — shared
 *      with the export so both produce byte-identical geometry.
 *   5. Write thumb.webp into the master dir + publish the runtime slot.
 *
 * The deprojected tiers are NEVER rewritten — this only adds thumb.webp, so
 * the committed atlas/full bytes don't drift.  Idempotent: a galaxy whose
 * thumb.webp already exists is skipped (delete it to force a rebuild).
 *
 * Requires StarNet: set STARNET_WEIGHTS (and optionally STARNET_BIN), or
 * MOCK_STARNET=1 for a stars-not-removed dry run.
 */
import sharp from 'sharp';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseRecipe, type RecipeCrop, type RecipeDisk } from '../famous-curator/plugin/recipe.js';
import { resolveStarnetConfig } from '../famous-curator/plugin/starnet.js';
import { willDeproject } from './deprojectDisk.js';
import { squareDeprojectCrop } from './squareDeprojectCrop.js';
import { buildThumbTile } from './buildThumbTile.js';
import { resolveFamousSourceUrl } from './resolveFamousSourceUrl.js';
import { fetchWithCache } from './sourceImageCache.js';
import { publishFamousRuntimeImages, CURATED_DIR } from './publishFamousRuntimeImages.js';
import { rawDataPath } from '../utils/io/rawDataRegistry.js';

const UA = 'skymap-curator/0.3 (https://github.com/rulkens/skymap; rulkens@gmail.com)';

/** Network download (cache miss path), following Wikipedia's UA policy. */
async function download(url: string): Promise<{ bytes: Buffer; mediaType: string }> {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return {
    bytes: Buffer.from(await r.arrayBuffer()),
    mediaType: r.headers.get('content-type') ?? 'application/octet-stream',
  };
}

/**
 * Scale crop + disk pixel coordinates by `factor`.  Used when the re-fetched
 * source differs in resolution from the one the recipe was authored against.
 */
function scaleGeometry(
  crop: RecipeCrop,
  disk: RecipeDisk | undefined,
  factor: number,
): { crop: RecipeCrop; disk: RecipeDisk | undefined } {
  const scaledCrop: RecipeCrop = {
    x: crop.x * factor,
    y: crop.y * factor,
    width: crop.width * factor,
    height: crop.height * factor,
    rotationDeg: crop.rotationDeg,
  };
  const scaledDisk: RecipeDisk | undefined = disk && {
    ...disk,
    centerPx: [disk.centerPx[0] * factor, disk.centerPx[1] * factor],
    radiusPx: disk.radiusPx * factor,
  };
  return { crop: scaledCrop, disk: scaledDisk };
}

type ThumbResult = 'built' | 'skipped-exists' | 'unresolvable' | 'failed';

async function backfillOne(repoRoot: string, id: string): Promise<ThumbResult> {
  const curatedDir = resolve(repoRoot, CURATED_DIR, id);
  const recipePath = join(curatedDir, 'recipe.json');
  if (!existsSync(recipePath)) return 'unresolvable';
  if (existsSync(join(curatedDir, 'thumb.webp'))) return 'skipped-exists';

  const recipe = parseRecipe(readFileSync(recipePath, 'utf8'));

  const fetchUrl = resolveFamousSourceUrl(recipe.metadata.sourceUrl);
  if (fetchUrl === null) {
    process.stderr.write(`  ${id}: unresolvable source (${recipe.metadata.sourceUrl})\n`);
    return 'unresolvable';
  }

  const starnetConfig = resolveStarnetConfig(process.env);
  const workDir = mkdtempSync(join(tmpdir(), `famous-thumb-${id}-`));

  const { bytes, fromCache } = await fetchWithCache(fetchUrl, {
    download,
    cacheDir: rawDataPath('famous.source-cache-dir'),
  });
  const sourcePath = join(workDir, 'source.img');
  writeFileSync(sourcePath, bytes);

  // Rescale the recorded geometry if the re-fetched file changed resolution.
  let crop: RecipeCrop = recipe.crop;
  let disk: RecipeDisk | undefined = recipe.disk;
  const meta = await sharp(bytes).metadata();
  if (recipe.source && meta.width && meta.width !== recipe.source.width) {
    const factor = meta.width / recipe.source.width;
    const aspectDrift = Math.abs(meta.height! / recipe.source.height - factor);
    if (aspectDrift > 0.01) {
      process.stderr.write(
        `  ${id}: WARN re-fetched aspect differs from recipe.source — crop may be off\n`,
      );
    }
    ({ crop, disk } = scaleGeometry(crop, disk, factor));
    process.stderr.write(`  ${id}: rescaled geometry ×${factor.toFixed(4)} (source changed)\n`);
  }

  // Same extractionCrop the export route commits: square-snapped when the disk
  // is deprojected, the maintainer's rect otherwise.
  const ar = disk?.axisRatio;
  const deprojected = disk?.deproject === true && ar !== undefined && willDeproject(ar);
  const extractionCrop = deprojected && disk ? squareDeprojectCrop(crop, disk, ar!) : crop;

  const thumb = await buildThumbTile({
    sourcePath,
    extractionCrop,
    starnet: recipe.starnet,
    alpha: recipe.alpha,
    starnetConfig,
    workDir,
  });
  writeFileSync(join(curatedDir, 'thumb.webp'), thumb);
  publishFamousRuntimeImages({ repoRoot, id });

  process.stderr.write(`  ${id}: built thumb${fromCache ? ' (source cached)' : ''}\n`);
  return 'built';
}

export async function buildFamousThumbs(repoRoot: string): Promise<Record<ThumbResult, number>> {
  // StarNet runs with cwd = the per-galaxy tmp dir (so its stray mask.jpg lands
  // there), so a relative STARNET_WEIGHTS would resolve against that tmp dir and
  // fail with a generic "Failed". Pin it absolute up front.
  if (process.env.STARNET_WEIGHTS) {
    process.env.STARNET_WEIGHTS = resolve(process.env.STARNET_WEIGHTS);
  }

  const tally: Record<ThumbResult, number> = {
    built: 0,
    'skipped-exists': 0,
    unresolvable: 0,
    failed: 0,
  };
  const root = resolve(repoRoot, CURATED_DIR);
  if (!existsSync(root)) return tally;

  const ids = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();

  for (const id of ids) {
    try {
      tally[await backfillOne(repoRoot, id)]++;
    } catch (err) {
      tally.failed++;
      process.stderr.write(`  ${id}: FAILED ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  return tally;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildFamousThumbs(process.cwd())
    .then((t) => {
      process.stderr.write(
        `build-famous-thumbs: built ${t.built}, skipped(exists) ${t['skipped-exists']}, ` +
          `unresolvable ${t.unresolvable}, failed ${t.failed}\n`,
      );
      if (t.failed > 0) process.exit(1);
    })
    .catch((err: unknown) => {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
