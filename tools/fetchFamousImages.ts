#!/usr/bin/env node
/**
 * fetchFamousImages — for every entry in `data/famous_galaxies.seed.json`,
 * download a DESI Legacy Imaging cutout sized to 1.3× the galaxy's
 * diameter, run it through the transparency processor, and write a
 * 256×256 WebP at `public/images/famous/<id>.webp`.
 *
 * Idempotent by default: skips entries whose WebP already exists.  Pass
 * `--force` to re-fetch every entry.
 *
 * DESI Legacy URL pattern (verified live during plan-write):
 *   https://www.legacysurvey.org/viewer/cutout.jpg
 *     ?ra=<deg>&dec=<deg>&layer=ls-dr10&pixscale=<arcsec/px>&size=<px>
 *
 * Sizing formula:
 *   angular_diameter_arcsec = (diameterKpc / distanceMpc) / pi * 180 * 3600 / 1000
 *                           = diameterKpc / distanceMpc * 206.265
 *   target_arcsec = angular_diameter_arcsec * 1.3
 *   size_px = 512  (high-res input, downsampled to 256 after processing)
 *   pixscale = target_arcsec / size_px
 *
 * We fetch at 512 px and downsample to 256 in WebP encoding so the
 * background-cut + alpha fade have more pixels to work with.
 *
 * Concurrency capped at 4 to avoid hammering DESI's servers; sequential
 * fallback on persistent errors.  Per-entry failures log loudly but
 * don't abort the run — the user gets every image they can.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseFamousSeed, type FamousEntry } from './parsers/famousSeed.js';
import {
  sampleCornerColor,
  applyTransparency,
  type RGBA,
} from './famousImageProcessor.js';

const CONCURRENCY = 2;
const FETCH_PX = 512; // input resolution (DESI cutout)
const OUT_PX = 256;   // output WebP resolution
/**
 * Milliseconds to wait between each request per worker.  DESI's cutout
 * service enforces a rate limit; 1 s per worker (× 2 workers = ~2 req/s)
 * keeps us comfortably below the threshold without making the full run
 * take more than ~60 s for 20 galaxies.
 */
const REQUEST_DELAY_MS = 1000;
/**
 * Max retry attempts on HTTP 429 (rate-limited) responses before giving
 * up on an entry.  Each retry doubles the delay starting from REQUEST_DELAY_MS.
 */
const MAX_RETRIES = 3;
/**
 * Pixel colour-distance threshold for the sky-cut.  16 is permissive
 * enough that DESI's slightly-noisy backgrounds get fully cut, but
 * tight enough that dim galaxy halos survive.  Tune per-entry only if
 * a galaxy looks wrong in the dev server.
 */
const SKY_TOLERANCE = 16;
/**
 * Outer radial fade fraction.  10% means the outermost 10% of the
 * image fades smoothly to transparent, hiding any sky pixels the
 * colour cut missed.
 */
const FADE_OUTER_FRACTION = 0.1;

/**
 * Maximum arcsec/pixel scale we'll request.  Above this (e.g. M31 at
 * ~45 arcsec/px) DESI returns a very low-resolution mosaic where the
 * sky-cut cannot distinguish galaxy from background — the entire image
 * becomes washed out.  3.0 arcsec/px gives a 512px cutout that spans
 * ~25 arcmin, enough to show even the largest nearby spirals nicely
 * (M31's core is still visible; only the very extended outer disk is
 * cropped, which is fine for an icon).
 */
const MAX_PIXSCALE = 3.0;

/**
 * Compute the DESI cutout URL for a given famous entry.
 */
function buildCutoutUrl(e: FamousEntry): string {
  const arcsecDiameter = (e.diameterKpc / e.distanceMpc) * 206.265;
  const targetArcsec = arcsecDiameter * 1.3;
  // Clamp pixscale so extremely nearby/large galaxies (e.g. M31) don't
  // produce a tiny-pixscale URL that returns a uniform blank mosaic.
  const pixscale = Math.min(targetArcsec / FETCH_PX, MAX_PIXSCALE);
  const params = new URLSearchParams({
    ra: e.ra.toString(),
    dec: e.dec.toString(),
    layer: 'ls-dr10',
    pixscale: pixscale.toFixed(4),
    size: FETCH_PX.toString(),
  });
  return `https://www.legacysurvey.org/viewer/cutout.jpg?${params.toString()}`;
}

/**
 * Fetch one entry, process, write WebP.  Returns true on success, false
 * on any failure (logged to stderr).
 */
async function fetchOne(e: FamousEntry, force: boolean): Promise<boolean> {
  const outDir = resolve('public/images/famous');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${e.id}.webp`);
  if (existsSync(outPath) && !force) {
    process.stderr.write(`  skip ${e.id} (cached)\n`);
    return true;
  }

  const url = buildCutoutUrl(e);
  let res: Response | undefined;
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    if (attempt > 0) {
      // Exponential back-off: 1s, 2s, 4s … on repeated 429s.
      const delay = REQUEST_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      res = await fetch(url);
    } catch (err) {
      process.stderr.write(`  fail ${e.id}: network ${(err as Error).message}\n`);
      return false;
    }
    if (res.status === 429) {
      attempt++;
      process.stderr.write(`  rate-limited ${e.id} (attempt ${attempt}/${MAX_RETRIES})…\n`);
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    process.stderr.write(`  fail ${e.id}: HTTP ${res?.status ?? 'unknown'}\n`);
    return false;
  }
  // Throttle politely: wait between requests even on success.
  await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  const jpegBuf = Buffer.from(await res.arrayBuffer());

  // Decode JPEG → raw RGBA via sharp.  Resize to FETCH_PX up front in
  // case DESI returned a different size (it sometimes clamps small).
  const { data, info } = await sharp(jpegBuf)
    .resize(FETCH_PX, FETCH_PX, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const sky: RGBA = sampleCornerColor(rgba, info.width, info.height);
  applyTransparency(rgba, info.width, info.height, sky, {
    skyTolerance: SKY_TOLERANCE,
    fadeOuterFraction: FADE_OUTER_FRACTION,
  });
  // Re-encode RGBA → WebP at OUT_PX, with quality tuned for ~10-20 KB.
  const webp = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(OUT_PX, OUT_PX, { fit: 'cover' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(outPath, webp);
  process.stderr.write(`  ok   ${e.id}  ${(webp.byteLength / 1024).toFixed(1)} KB\n`);
  return true;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const seedPath = resolve('data/famous_galaxies.seed.json');
  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  process.stderr.write(`fetching ${entries.length} famous galaxy thumbnails…\n`);

  // Simple promise-pool: keep CONCURRENCY in flight at once.
  let i = 0;
  let ok = 0;
  let fail = 0;
  async function worker(): Promise<void> {
    while (i < entries.length) {
      const e = entries[i++]!;
      const success = await fetchOne(e, force);
      if (success) ok++;
      else fail++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stderr.write(`done; ${ok} ok, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
