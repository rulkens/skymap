#!/usr/bin/env node
/**
 * fetchFamousImages — for every entry in `data/famous_galaxies.seed.json`,
 * download an imaging cutout sized to 1.3× the galaxy's diameter, run it
 * through the transparency processor, and write a 256×256 WebP at
 * `public/images/famous/<id>.webp`.
 *
 * Idempotent by default: skips entries whose WebP already exists.  Pass
 * `--force` to re-fetch every entry.
 *
 * ── Cutout endpoint + layer fallback chain ─────────────────────────────
 *
 * All requests go to the DESI Legacy Survey viewer's cutout endpoint:
 *
 *   https://www.legacysurvey.org/viewer/cutout.jpg
 *     ?ra=<deg>&dec=<deg>&layer=<name>&pixscale=<arcsec/px>&size=<px>
 *
 * The endpoint serves multiple imaging surveys behind a single API by
 * varying the `layer` parameter.  We try, in order:
 *
 *   1. `ls-dr10`  — DESI Legacy Imaging DR10.  Highest-quality optical
 *                   data we have access to, but coverage is roughly the
 *                   southern + equatorial sky (~1/3 of the whole sphere).
 *                   Northern objects like M31 (dec=+41°) and M33
 *                   (dec=+30°) come back as a "no data" tile that
 *                   decodes to a uniformly-black JPEG.
 *
 *   2. `sdss`     — Sloan Digital Sky Survey imaging.  Covers most of
 *                   the northern sky DESI Legacy doesn't, including
 *                   M31/M33.  Slightly lower resolution and shallower
 *                   than DR10 but visually comparable for thumbnails.
 *
 *   3. `dss2`     — Digitized Sky Survey 2.  All-sky photographic plate
 *                   scans; the historical fallback.  Lower resolution
 *                   and dynamic range than the modern surveys, but it
 *                   has data *everywhere*, so it's the safety net for
 *                   the rare tile both DR10 and SDSS miss.
 *
 * ── Why post-process alpha is the blank signal ─────────────────────────
 *
 * Different layers signal "no coverage" in different ways: DESI Legacy
 * returns a uniformly-black JPEG, SDSS sometimes returns mid-grey
 * noise, etc.  Rather than try to detect each layer's specific failure
 * mode by inspecting the raw JPEG, we run the cutout through the
 * standard transparency pipeline and then check the result: if
 * `applyTransparency` cut more than ~97% of the image to alpha 0
 * (mean alpha < 8 on the 0..255 scale), there was effectively nothing
 * to see — the corner-sky-cut consumed the whole frame.  That's the
 * actual signal we care about, and it's robust to whatever "blank" form
 * a given layer ends up producing.
 *
 * ── Sizing formula (unchanged across layers) ───────────────────────────
 *
 *   angular_diameter_arcsec = (diameterKpc / distanceMpc) / pi * 180 * 3600 / 1000
 *                           = diameterKpc / distanceMpc * 206.265
 *   target_arcsec = angular_diameter_arcsec * 1.3
 *   size_px = 512  (high-res input, downsampled to 256 after processing)
 *   pixscale = target_arcsec / size_px   (clamped at MAX_PIXSCALE)
 *
 * We fetch at 512 px and downsample to 256 in WebP encoding so the
 * background-cut + alpha fade have more pixels to work with.  The
 * MAX_PIXSCALE clamp applies to every layer — the rationale is the same
 * regardless of which survey supplies the pixels (see comment on the
 * constant below).
 *
 * Concurrency capped at 2 (× ~1 req/s per worker via REQUEST_DELAY_MS)
 * to stay polite with the cutout service.  Per-entry failures log
 * loudly but don't abort the run — the user gets every image they can.
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
const FETCH_PX = 512; // input resolution (cutout)
const OUT_PX = 256;   // output WebP resolution
/**
 * Milliseconds to wait between each request per worker.  The cutout
 * service enforces a rate limit; 1 s per worker (× 2 workers = ~2 req/s)
 * keeps us comfortably below the threshold without making the full run
 * take more than ~60 s for 20 galaxies.  Note that with the layer
 * fallback chain a single entry may issue up to 3 requests, so a worst-
 * case M31-style entry sleeps ~3 s; that's still well within budget.
 */
const REQUEST_DELAY_MS = 1000;
/**
 * Max retry attempts on HTTP 429 (rate-limited) responses before giving
 * up on a *single* layer attempt.  Each retry doubles the delay starting
 * from REQUEST_DELAY_MS.  A 429-exhausted layer still falls through to
 * the next layer in the chain — getting any image is better than none.
 */
const MAX_RETRIES = 3;
/**
 * Pixel colour-distance threshold for the sky-cut.  16 is permissive
 * enough that slightly-noisy backgrounds get fully cut, but tight
 * enough that dim galaxy halos survive.  Tune per-entry only if a
 * galaxy looks wrong in the dev server.
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
 * ~45 arcsec/px) the cutout service returns a very low-resolution
 * mosaic where the sky-cut cannot distinguish galaxy from background —
 * the entire image becomes washed out.  3.0 arcsec/px gives a 512px
 * cutout that spans ~25 arcmin, enough to show even the largest nearby
 * spirals nicely (M31's core is still visible; only the very extended
 * outer disk is cropped, which is fine for an icon).
 *
 * Applies to every layer: the resolution-vs-detail trade-off is
 * intrinsic to the angular size of the target, not the survey.
 */
const MAX_PIXSCALE = 3.0;

/**
 * Mean alpha (0..255) below which we treat a processed cutout as
 * "blank" and try the next layer.  After `applyTransparency`, a tile
 * with no real signal — e.g. DESI's uniformly-black no-coverage
 * response — has had its corner-sky colour matched everywhere and the
 * whole frame cut to alpha 0.  Setting the threshold at 8 means we
 * declare blank when more than ~97% of pixels are fully transparent
 * (255 × 0.03 ≈ 7.65), which leaves headroom for genuinely sparse
 * tiles (faint dwarfs, edge-on disks against busy fields) where a
 * fraction of pixels do survive the cut.
 */
const BLANK_MEAN_ALPHA_THRESHOLD = 8;

/**
 * Layer chain in order of preference.  See module header for rationale.
 * Adding a fourth layer is as simple as appending to this array, as
 * long as the new layer name is supported by the legacysurvey.org
 * viewer's cutout endpoint.
 */
const LAYER_CHAIN: ReadonlyArray<string> = ['ls-dr10', 'sdss', 'dss2'];

/**
 * Compute the cutout URL for a given famous entry on a given layer.
 *
 * Layer is parameterised so the fallback chain can issue the same
 * geometric query against successive surveys without any other change.
 */
function buildCutoutUrl(e: FamousEntry, layer: string): string {
  const arcsecDiameter = (e.diameterKpc / e.distanceMpc) * 206.265;
  const targetArcsec = arcsecDiameter * 1.3;
  // Clamp pixscale so extremely nearby/large galaxies (e.g. M31) don't
  // produce a tiny-pixscale URL that returns a uniform blank mosaic.
  const pixscale = Math.min(targetArcsec / FETCH_PX, MAX_PIXSCALE);
  const params = new URLSearchParams({
    ra: e.ra.toString(),
    dec: e.dec.toString(),
    layer,
    pixscale: pixscale.toFixed(4),
    size: FETCH_PX.toString(),
  });
  return `https://www.legacysurvey.org/viewer/cutout.jpg?${params.toString()}`;
}

/**
 * Compute the mean alpha (0..255) of a processed RGBA buffer.
 *
 * Used as the post-processing "is this blank?" signal.  Iterating every
 * pixel is fine: 512×512 = 262 144 pixels × ~20 entries = 5M ops total
 * on a one-shot CLI.  Keeping it as a simple loop avoids a sharp
 * round-trip for stats we already have in memory.
 */
function meanAlpha(buf: Uint8ClampedArray, width: number, height: number): number {
  const n = width * height;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += buf[i * 4 + 3]!;
  }
  return sum / n;
}

/**
 * Result of a single layer attempt.  Either we have a non-blank
 * processed buffer ready to encode, or we know we should try the next
 * layer (with a reason for the log).
 */
type LayerAttempt =
  | { kind: 'ok'; rgba: Uint8ClampedArray; width: number; height: number }
  | { kind: 'blank' }
  | { kind: 'error'; reason: string };

/**
 * Fetch + decode + process a single layer for a single entry.  Honours
 * the 429 retry/back-off loop on this layer only — a 429-exhausted
 * layer falls through to `error`, and the caller continues to the next
 * layer in the chain.
 */
async function tryLayer(e: FamousEntry, layer: string): Promise<LayerAttempt> {
  const url = buildCutoutUrl(e, layer);
  let res: Response | undefined;
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    if (attempt > 0) {
      const delay = REQUEST_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      res = await fetch(url);
    } catch (err) {
      return { kind: 'error', reason: `network ${(err as Error).message}` };
    }
    if (res.status === 429) {
      attempt++;
      process.stderr.write(`  rate-limited ${e.id}/${layer} (attempt ${attempt}/${MAX_RETRIES})…\n`);
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    return { kind: 'error', reason: `HTTP ${res?.status ?? 'unknown'}` };
  }
  // Throttle politely between requests, even on success.
  await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

  const jpegBuf = Buffer.from(await res.arrayBuffer());
  // Decode JPEG → raw RGBA via sharp.  Resize to FETCH_PX up front in
  // case the service returned a different size (it sometimes clamps small).
  let data: Buffer;
  let info: sharp.OutputInfo;
  try {
    const out = await sharp(jpegBuf)
      .resize(FETCH_PX, FETCH_PX, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = out.data;
    info = out.info;
  } catch (err) {
    return { kind: 'error', reason: `decode ${(err as Error).message}` };
  }
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const sky: RGBA = sampleCornerColor(rgba, info.width, info.height);
  applyTransparency(rgba, info.width, info.height, sky, {
    skyTolerance: SKY_TOLERANCE,
    fadeOuterFraction: FADE_OUTER_FRACTION,
  });
  // Blank check: did the colour-cut just consume the whole frame?
  if (meanAlpha(rgba, info.width, info.height) < BLANK_MEAN_ALPHA_THRESHOLD) {
    return { kind: 'blank' };
  }
  return { kind: 'ok', rgba, width: info.width, height: info.height };
}

/**
 * Fetch one entry, walking the layer chain until a non-blank cutout is
 * obtained, then encode + write the WebP.  Returns true on success,
 * false on any failure (logged to stderr).
 */
async function fetchOne(e: FamousEntry, force: boolean): Promise<boolean> {
  const outDir = resolve('public/images/famous');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${e.id}.webp`);
  if (existsSync(outPath) && !force) {
    process.stderr.write(`  skip ${e.id} (cached)\n`);
    return true;
  }

  // Walk the layer chain.  Track the "trail" of layers tried so the
  // success log can show e.g. `ls-dr10 → blank, sdss` for fallbacks.
  const trail: string[] = [];
  let success: { layer: string; rgba: Uint8ClampedArray; width: number; height: number } | undefined;
  for (const layer of LAYER_CHAIN) {
    const result = await tryLayer(e, layer);
    if (result.kind === 'ok') {
      success = { layer, rgba: result.rgba, width: result.width, height: result.height };
      break;
    }
    if (result.kind === 'blank') {
      trail.push(`${layer} → blank`);
      continue;
    }
    // 'error': log loudly but continue to the next layer.  A transient
    // network/HTTP failure on one layer shouldn't block fallback.
    process.stderr.write(`  warn ${e.id}/${layer}: ${result.reason}\n`);
    trail.push(`${layer} → ${result.reason}`);
  }

  if (!success) {
    process.stderr.write(`  fail ${e.id}: all layers blank (${trail.join('; ')})\n`);
    return false;
  }

  // Re-encode RGBA → WebP at OUT_PX, with quality tuned for ~10-20 KB.
  const webp = await sharp(Buffer.from(success.rgba), {
    raw: { width: success.width, height: success.height, channels: 4 },
  })
    .resize(OUT_PX, OUT_PX, { fit: 'cover' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(outPath, webp);

  // Format the success log: trail of failed layers (if any) + the
  // landing layer.  Single-attempt success looks like `ls-dr10 17.3 KB`;
  // a fallback looks like `ls-dr10 → blank, sdss 17.3 KB`.
  const landed = trail.length > 0 ? `${trail.join(', ')}, ${success.layer}` : success.layer;
  process.stderr.write(
    `  ok   ${e.id}  ${landed}  ${(webp.byteLength / 1024).toFixed(1)} KB\n`,
  );
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
