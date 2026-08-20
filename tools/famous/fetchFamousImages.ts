#!/usr/bin/env node
/**
 * fetchFamousImages — for every entry in `data/seeds/famous_galaxies.seed.json`,
 * obtain a 256×256 WebP thumbnail at `public/images/famous/<id>.webp`.
 *
 * ── Why Wikipedia is the *primary* source (and DESI is the fallback) ────
 *
 * The previous implementation walked a chain of survey-imaging layers
 * (DESI Legacy DR10 → SDSS → unWISE) and ran the result through a corner-
 * colour sky-cut.  That worked well *when* the survey actually had clean
 * imagery for the target — which fails for the most famous, nearby objects
 * (M31, M33, M101) where the field of view contains hundreds of resolved
 * field stars and the survey cutouts crop tightly to a small fraction of
 * the galaxy's angular size.  Visually, the auto-fetched thumbnails were
 * the worst for the galaxies users care about most.
 *
 * Wikipedia article hero images solve all four issues at once:
 *
 *  - **Pre-curated framing.** A hand-picked composite hero image (Hubble,
 *    ESO, JWST, APOD, amateur deep-sky) is centred on the galaxy and
 *    cropped at a sensible angular radius.  No "the galaxy is in the
 *    bottom-left corner" glitches.
 *  - **Clean black backgrounds.** Press-kit images are aggressively
 *    masked / sky-subtracted upstream of Wikipedia.  We don't need
 *    `applyTransparency`'s corner-sample sky-cut; just a soft radial
 *    fade to soften the rectangular frame against the renderer's stars.
 *  - **Brightness/contrast normalised.** Whatever colour grading the
 *    image hosts decided to apply is what professionals chose for that
 *    galaxy — far more aesthetically consistent than what we'd derive
 *    from a single survey's raw pixels.
 *  - **All-sky coverage.** Wikipedia has an article (with image) for
 *    every Messier and almost every Caldwell — coverage no one survey
 *    matches.
 *
 * The trade-off is licensing: Wikipedia images carry a mix of CC-BY-SA,
 * PD-NASA, PD-self, and ESO-attribution licences.  Skymap is a personal
 * project so this is fine, but a hypothetical commercial fork would need
 * to audit per-image attribution.  The cache JSON we write at
 * `data/raw/famous/wikipedia_famous_cache.json` carries the source URL for each
 * image, which is enough to reconstruct attribution.
 *
 * ── Title-chain fallback (broadened from the expansion agent) ──────────
 *
 * Wikipedia titles for the same galaxy can take many forms.  A previous
 * narrow heuristic missed valid pages (e.g. NGC 5128 / Centaurus A — the
 * page lives at `NGC_5128`, not `Centaurus_A`).  We now walk:
 *
 *   1. `Messier_<N>`  — for any seed id starting with `m<digits>`.
 *   2. `M_<N>`        — Wikipedia sometimes stores the form with the
 *                       underscore (e.g. `M_87` is a redirect; usually).
 *   3. `NGC_<NNNN>`   — leading zeros stripped (NOT `NGC_0224`!).  The
 *                       seed entry's `names` array is parsed to extract
 *                       the NGC number; HyperLEDA stores it zero-padded
 *                       as `NGC0224`, but Wikipedia's article slug is
 *                       always the unpadded form.
 *   4. `IC_<NNNN>`    — same for IC catalog members.
 *   5. Common name    — any non-catalog entries in `e.names` with spaces
 *                       replaced by underscores (e.g. `Andromeda_Galaxy`,
 *                       `Sombrero_Galaxy`, `Whirlpool_Galaxy`).
 *
 * The first candidate that returns a usable, non-disambiguation page
 * with at least one of `originalimage.source` or `thumbnail.source` wins.
 *
 * ── Image processing pipeline (Wikipedia path) ─────────────────────────
 *
 *   1. Fetch the URL into a Buffer (sharp handles JPEG / PNG / SVG —
 *      Wikipedia images come in all three).
 *   2. Resize to 512×512 with `fit: 'inside'` to preserve aspect ratio
 *      WITHOUT cropping (the previous DESI path used `cover`, which is
 *      fine for survey square cutouts but would chop off non-square
 *      Wikipedia hero images).  Composite onto a 512×512 transparent
 *      canvas centred so non-square images are padded with alpha.
 *   3. Decode RGBA → Uint8ClampedArray.
 *   4. `applyRadialFade(buf, 512, 512, 0.1)`  (NO sky-cut!)
 *   5. Re-encode with sharp.webp({ quality: 82, alphaQuality: 90 }) at
 *      256×256 (with the same `fit: 'inside'` + transparent extend).
 *
 * ── Falling back to DESI ───────────────────────────────────────────────
 *
 * If none of the title candidates yields a page with an image, OR if
 * the user passes `--source-preference desi`, we fall back to the
 * original DESI/SDSS/unWISE layer chain.  This is the only way to get
 * imagery for the rare galaxy with no Wikipedia article (none exist in
 * the current seed, but a future expansion might pull in obscure
 * surveys-only objects).
 *
 * ── Flags ──────────────────────────────────────────────────────────────
 *
 *   --force                       Re-fetch every entry, ignoring the
 *                                 idempotent skip-if-cached check.
 *   --source-preference wikipedia (default) Try Wikipedia first, DESI fall.
 *   --source-preference desi      Skip Wikipedia entirely, only try DESI.
 *
 * ── Polite rate limit ──────────────────────────────────────────────────
 *
 * Wikipedia's REST API is documented at ~200 req/s but explicitly asks
 * for "no more than 1 req/s sequential" for non-cached content.  Image
 * downloads from upload.wikimedia.org are served from CDN and don't
 * carry the same limit, but we apply the same 1 s gap to be safe.
 *
 * Concurrency is fixed at 1 worker for the Wikipedia path — the polite
 * sequential model — versus the original 2 for DESI.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCuratedOverrides, type CuratedOverrideIndex } from './famousCuratedOverrides';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import sharp, { type OutputInfo } from 'sharp';
import { parseFlags } from '../utils/cli/args';
import { loadJsonCache } from '../utils/io/loadJsonCache';
import { saveJsonCache } from '../utils/io/saveJsonCache';
import { parseFamousSeed, type FamousEntry } from '../parsers/famousSeed';
import {
  parseWikipediaSummary,
  wikipediaSummaryUrl,
  type WikipediaSummary,
} from '../parsers/wikipediaSummary';
import {
  applyRadialFade,
  applyTransparency,
  sampleCornerColor,
  type RGBA,
} from './famousImageProcessor';

// ──────────────────────────────────────────────────────────────────────
// Constants — Wikipedia path

/** Output WebP resolution (square).  Matches the runtime atlas slot size. */
const OUT_PX = 256;
/**
 * Working buffer resolution.  Twice the output gives the radial fade
 * smoother gradients and the WebP encoder a richer signal to compress.
 * Resizing the encoded WebP to 256 happens in the final encoder step,
 * NOT in the working buffer — so radial-fade math operates on 512².
 */
const WORK_PX = 512;
/** Outer fraction of the image radius to fade out; matches the legacy DESI fade. */
const FADE_OUTER_FRACTION = 0.1;
/** Polite Wikipedia sequential rate-limit (REST API + image CDN). */
const WIKIPEDIA_DELAY_MS = 1000;

// ──────────────────────────────────────────────────────────────────────
// Constants — DESI fallback path (unchanged from the previous version)

const DESI_FETCH_PX = 512;
const DESI_REQUEST_DELAY_MS = 1000;
const DESI_MAX_RETRIES = 3;
const DESI_SKY_TOLERANCE = 16;
const DESI_FADE_OUTER_FRACTION = 0.1;
const DESI_MAX_PIXSCALE = 3.0;
const DESI_BLANK_MEAN_ALPHA_THRESHOLD = 8;
const DESI_LAYER_CHAIN: ReadonlyArray<string> = ['ls-dr10', 'sdss', 'unwise-neo7'];

// ──────────────────────────────────────────────────────────────────────
// Pure helpers (testable surface)

/**
 * Build the Wikipedia title fallback chain for a seed entry.  Returns
 * an ordered, deduplicated list of candidate titles.  Pure function:
 * no I/O, no side effects.  See module header for rationale.
 */
export function buildWikipediaTitleChain(e: FamousEntry): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string): void => {
    const norm = t.trim().replace(/\s+/g, '_');
    if (norm.length === 0) return;
    if (seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };

  // 1 + 2: Messier-style ids (e.g. seed id `m31` → `Messier_31`, `M_31`).
  // The seed id is the canonical key from `expandFamousFromCatalogs.ts`,
  // so it's reliably lower-case `m<digits>` for Messier entries.
  const messierMatch = /^m(\d+)$/i.exec(e.id);
  if (messierMatch) {
    add(`Messier_${messierMatch[1]}`);
    add(`M_${messierMatch[1]}`);
  }

  // 1.5: Caldwell-style ids — handy when the entry's only NGC name is a
  // dim object that has no Wikipedia page of its own.  Caldwell pages
  // exist for most southern entries.
  const caldwellMatch = /^c(\d+)$/i.exec(e.id);
  if (caldwellMatch) {
    add(`Caldwell_${caldwellMatch[1]}`);
  }

  // 3 + 4: NGC / IC titles, ZERO-PADDING STRIPPED.  Walk e.names looking
  // for any "NGC <digits>" / "IC <digits>" entry.  Wikipedia's slug is
  // always the unpadded form, so `NGC 0224` → `NGC_224`, not `NGC_0224`.
  for (const name of e.names) {
    const ngc = /^(NGC|IC)\s*0*(\d+)\s*$/i.exec(name);
    if (ngc) {
      const prefix = ngc[1]!.toUpperCase();
      const num = ngc[2]!;
      add(`${prefix}_${num}`);
    }
  }

  // 5: Common names — any name that ISN'T a catalog id.  These tend to
  // be the most distinctive titles (e.g. `Andromeda_Galaxy`,
  // `Sombrero_Galaxy`) that uniquely identify the article.
  for (const name of e.names) {
    if (/^(M|NGC|IC|C)\s*\d+/i.test(name)) continue;
    if (/^[mc]\d+$/i.test(name)) continue;
    add(name);
  }

  return out;
}

/**
 * Choose the best image URL from a parsed Wikipedia summary, or
 * `undefined` if the article has no usable image.  Disambiguation pages
 * always return undefined regardless of whether the API attached an
 * image — those are never the article we want.
 *
 * Preference: `originalimage` (full resolution) > `thumbnail` (~320px).
 * The 320px thumbnails are usable but downscaling to 256 from a higher-
 * resolution source preserves more detail.
 */
export function chooseWikipediaImageUrl(s: WikipediaSummary): string | undefined {
  if (s.type === 'disambiguation') return undefined;
  if (s.originalImageUrl !== undefined) return s.originalImageUrl;
  if (s.thumbnailUrl !== undefined) return s.thumbnailUrl;
  return undefined;
}

/**
 * Copy the curator's `atlas.webp` for `id` into the runtime atlas slot
 * path (`public/images/famous/<id>.webp`).  Called from `main()` when
 * an override exists for an entry; lets the maintainer's hand-curated
 * thumbnail replace whatever Wikipedia/DESI would have produced.
 *
 * Public for unit testing — see fetchFamousImages.curated.test.ts.
 *
 * Throws when the source atlas.webp is missing.  That should only
 * happen if `data/seeds/famous_curated_overrides.json` has an entry but the
 * corresponding `public/images/famous-curated/<id>/` directory was
 * deleted manually — surfacing it loud is correct.
 */
export function copyCuratedAtlas(repoRoot: string, id: string): void {
  const src = resolve(repoRoot, `public/images/famous-curated/${id}/atlas.webp`);
  const dst = resolve(repoRoot, `public/images/famous/${id}.webp`);
  if (!existsSync(src)) {
    throw new Error(`curated atlas missing: ${id}/atlas.webp (expected at ${src})`);
  }
  copyFileSync(src, dst);
}

// ──────────────────────────────────────────────────────────────────────
// Wikipedia summary lookup (DI-friendly)

/**
 * Pure interface for fetching a Wikipedia summary response body for a
 * given title.  Returns `null` when the page does not exist (HTTP 404)
 * so the caller can fall through to the next title.  Throws on network
 * failure / unexpected non-OK responses — those are bugs, not "page
 * doesn't exist", and shouldn't be silently swallowed.
 */
export type WikipediaBodyFetcher = (title: string) => Promise<string | null>;

/**
 * Pure interface for fetching a binary image body from a URL.  Returns
 * a Buffer.  Throws on network failure or non-OK response.  Tests inject
 * a stub returning a known-shape PNG/JPEG buffer.
 */
export type ImageBytesFetcher = (url: string) => Promise<Buffer>;

/**
 * Resolve a Wikipedia image URL by walking the title chain.  Returns
 * `{ title, url, summary }` for the first candidate that returns an
 * article with an image, or `null` if none match.  Pure function over
 * the injected fetcher — no real network calls, no on-disk I/O.
 *
 * Public for testing.
 */
export async function resolveWikipediaImage(
  candidates: readonly string[],
  fetchBody: WikipediaBodyFetcher,
): Promise<{ title: string; url: string; summary: WikipediaSummary } | null> {
  for (const title of candidates) {
    const body = await fetchBody(title);
    if (body === null) continue;
    let summary: WikipediaSummary;
    try {
      summary = parseWikipediaSummary(body);
    } catch {
      // Garbage response — skip and try next title.  Not a hard error
      // because a transient HTML 503 from Wikipedia's CDN shouldn't
      // poison the whole entry; the next title may resolve cleanly.
      continue;
    }
    const url = chooseWikipediaImageUrl(summary);
    if (url !== undefined) {
      return { title, url, summary };
    }
  }
  return null;
}

/**
 * Process a Wikipedia image bytes buffer into a 256×256 WebP.  Pure
 * over the buffer — no I/O.  Public for testing.
 *
 * Steps (see module header for rationale):
 *
 *  1. Decode the input bytes with sharp (handles JPG/PNG/SVG).  Resize
 *     to fit *inside* WORK_PX × WORK_PX while preserving aspect ratio,
 *     then `extend` with transparent padding so the working buffer is
 *     exactly square (the radial-fade math assumes square geometry).
 *  2. Read out raw RGBA, apply the radial fade only — no sky-cut.
 *  3. Re-encode at OUT_PX × OUT_PX with quality 82 / alphaQuality 90,
 *     same settings the DESI path used.
 */
export async function processWikipediaImageBuffer(input: Buffer): Promise<Buffer> {
  // Step 1: decode + scale-to-fit.  `fit: 'inside'` preserves aspect
  // ratio without cropping, so a 4000×2500 hero image becomes a
  // WORK_PX-wide rectangle (320 tall) rather than a square crop that
  // chops off the top + bottom of M31's disk.  We deliberately do NOT
  // call `flatten` — PNGs with native transparency keep their alpha.
  const { data: scaledData, info: scaledInfo } = await sharp(input)
    .resize(WORK_PX, WORK_PX, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Letterbox onto a square WORK_PX × WORK_PX canvas with transparent
  // padding.  The radial-fade math assumes a square buffer (it uses
  // `Math.hypot(cx, cy)` for the max radius), so non-square images get
  // padded with alpha 0 rather than stretched.  Centring math: split
  // the leftover pixels evenly, with any odd remainder on the
  // right/bottom edge.
  const w = scaledInfo.width;
  const h = scaledInfo.height;
  let squareData: Buffer;
  let squareInfo: OutputInfo;
  if (w === WORK_PX && h === WORK_PX) {
    squareData = scaledData;
    squareInfo = scaledInfo;
  } else {
    const padX = Math.floor((WORK_PX - w) / 2);
    const padY = Math.floor((WORK_PX - h) / 2);
    const padR = WORK_PX - w - padX;
    const padB = WORK_PX - h - padY;
    const out = await sharp(scaledData, { raw: { width: w, height: h, channels: 4 } })
      .extend({
        top: padY,
        bottom: padB,
        left: padX,
        right: padR,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    squareData = out.data;
    squareInfo = out.info;
  }

  // Step 2: radial fade.  No sky-cut — see module header.  This mutates
  // the buffer in place.
  const rgba = new Uint8ClampedArray(
    squareData.buffer,
    squareData.byteOffset,
    squareData.byteLength,
  );
  applyRadialFade(rgba, squareInfo.width, squareInfo.height, FADE_OUTER_FRACTION);

  // Step 3: re-encode at output resolution.  We resize 'fit: inside'
  // again as a defensive measure (squareInfo should already be WORK_PX,
  // but if a future change tweaks the geometry, the encoder won't crash).
  const webp = await sharp(Buffer.from(rgba), {
    raw: { width: squareInfo.width, height: squareInfo.height, channels: 4 },
  })
    .resize(OUT_PX, OUT_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  return webp;
}

// ──────────────────────────────────────────────────────────────────────
// DESI fallback (preserved from the previous version, slightly factored)

/**
 * Build the DESI Legacy cutout URL for a galaxy on a given layer.  See
 * the original module header for the maths and rationale.
 */
function buildCutoutUrl(e: FamousEntry, layer: string): string {
  const arcsecDiameter = (e.diameterKpc / e.distanceMpc) * 206.265;
  const targetArcsec = arcsecDiameter * 1.3;
  const pixscale = Math.min(targetArcsec / DESI_FETCH_PX, DESI_MAX_PIXSCALE);
  const params = new URLSearchParams({
    ra: e.ra.toString(),
    dec: e.dec.toString(),
    layer,
    pixscale: pixscale.toFixed(4),
    size: DESI_FETCH_PX.toString(),
  });
  return `https://www.legacysurvey.org/viewer/cutout.jpg?${params.toString()}`;
}

function meanAlpha(buf: Uint8ClampedArray, width: number, height: number): number {
  const n = width * height;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += buf[i * 4 + 3]!;
  }
  return sum / n;
}

type DesiLayerAttempt =
  | { kind: 'ok'; rgba: Uint8ClampedArray; width: number; height: number }
  | { kind: 'blank' }
  | { kind: 'error'; reason: string };

async function tryDesiLayer(e: FamousEntry, layer: string): Promise<DesiLayerAttempt> {
  const url = buildCutoutUrl(e, layer);
  let res: Response | undefined;
  let attempt = 0;
  while (attempt <= DESI_MAX_RETRIES) {
    if (attempt > 0) {
      const delay = DESI_REQUEST_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      res = await fetch(url);
    } catch (err) {
      return { kind: 'error', reason: `network ${(err as Error).message}` };
    }
    if (res.status === 429) {
      attempt++;
      process.stderr.write(
        `  rate-limited ${e.id}/${layer} (attempt ${attempt}/${DESI_MAX_RETRIES})…\n`,
      );
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    return { kind: 'error', reason: `HTTP ${res?.status ?? 'unknown'}` };
  }
  await new Promise((r) => setTimeout(r, DESI_REQUEST_DELAY_MS));

  const jpegBuf = Buffer.from(await res.arrayBuffer());
  let data: Buffer;
  let info: OutputInfo;
  try {
    const out = await sharp(jpegBuf)
      .resize(DESI_FETCH_PX, DESI_FETCH_PX, { fit: 'cover' })
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
    skyTolerance: DESI_SKY_TOLERANCE,
    fadeOuterFraction: DESI_FADE_OUTER_FRACTION,
  });
  if (meanAlpha(rgba, info.width, info.height) < DESI_BLANK_MEAN_ALPHA_THRESHOLD) {
    return { kind: 'blank' };
  }
  return { kind: 'ok', rgba, width: info.width, height: info.height };
}

/**
 * Walk the DESI layer chain.  Returns the encoded WebP bytes plus the
 * landing layer name for logging, or null if every layer was blank.
 */
async function fetchDesiFallback(e: FamousEntry): Promise<{ webp: Buffer; landed: string } | null> {
  const trail: string[] = [];
  let success:
    | { layer: string; rgba: Uint8ClampedArray; width: number; height: number }
    | undefined;
  for (const layer of DESI_LAYER_CHAIN) {
    const result = await tryDesiLayer(e, layer);
    if (result.kind === 'ok') {
      success = { layer, rgba: result.rgba, width: result.width, height: result.height };
      break;
    }
    if (result.kind === 'blank') {
      trail.push(`${layer} → blank`);
      continue;
    }
    process.stderr.write(`  warn ${e.id}/${layer}: ${result.reason}\n`);
    trail.push(`${layer} → ${result.reason}`);
  }
  if (!success) {
    process.stderr.write(`  fail ${e.id}: all DESI layers blank (${trail.join('; ')})\n`);
    return null;
  }
  const webp = await sharp(Buffer.from(success.rgba), {
    raw: { width: success.width, height: success.height, channels: 4 },
  })
    .resize(OUT_PX, OUT_PX, { fit: 'cover' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  const landed = trail.length > 0 ? `${trail.join(', ')}, ${success.layer}` : success.layer;
  return { webp, landed };
}

// ──────────────────────────────────────────────────────────────────────
// CLI runtime

type CliFlags = {
  force: boolean;
  /**
   * Source preference.  `wikipedia` (default) tries Wikipedia first
   * with DESI as fallback; `desi` skips Wikipedia entirely and only
   * uses the DESI layer chain.  Useful for users who want consistent
   * survey imagery (no licensing variance) at the cost of quality.
   */
  sourcePreference: 'wikipedia' | 'desi';
};

function parseCliArgs(argv: readonly string[]): CliFlags {
  const flags = parseFlags(argv, { '--force': 'bool' });
  let sourcePreference: 'wikipedia' | 'desi' = 'wikipedia';
  const idx = argv.indexOf('--source-preference');
  if (idx >= 0 && idx + 1 < argv.length) {
    const v = argv[idx + 1];
    if (v === 'wikipedia' || v === 'desi') {
      sourcePreference = v;
    } else {
      throw new Error(`--source-preference must be "wikipedia" or "desi" (got "${v}")`);
    }
  }
  return { force: flags['--force'], sourcePreference };
}

async function main(): Promise<void> {
  const flags = parseCliArgs(process.argv.slice(2));
  const seedPath = rawDataPath('famous.seed');
  const wikipediaCachePath = rawDataPath('famous.wikipedia-cache');
  const outDir = resolve('public/images/famous');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  process.stderr.write(
    `fetching ${entries.length} famous galaxy thumbnails ` +
      `(source preference: ${flags.sourcePreference})…\n`,
  );

  const curatedPath = rawDataPath('famous.curated');
  const curated: CuratedOverrideIndex = loadCuratedOverrides(curatedPath);
  process.stderr.write(`curator overrides: ${Object.keys(curated.entries).length} entries\n`);

  const wikipediaCache = loadJsonCache<Record<string, string>>(wikipediaCachePath);
  process.stderr.write(`Wikipedia cache: ${Object.keys(wikipediaCache).length} entries\n`);

  // Body fetcher with on-disk caching + 1 req/s sequential throttle.
  // We deliberately track the last-call timestamp at module scope here
  // because workers are sequential — if we ever bump concurrency we'd
  // need a real semaphore, but for now keep it simple.
  let lastWikipediaCallMs = 0;
  const fetchBody: WikipediaBodyFetcher = async (title) => {
    if (wikipediaCache[title] !== undefined) return wikipediaCache[title]!;
    const sinceLast = Date.now() - lastWikipediaCallMs;
    if (sinceLast < WIKIPEDIA_DELAY_MS) {
      await new Promise((r) => setTimeout(r, WIKIPEDIA_DELAY_MS - sinceLast));
    }
    let res: Response;
    try {
      res = await fetch(wikipediaSummaryUrl(title));
    } catch (err) {
      process.stderr.write(`  warn wiki ${title}: network ${(err as Error).message}\n`);
      lastWikipediaCallMs = Date.now();
      return null;
    }
    lastWikipediaCallMs = Date.now();
    if (res.status === 404) return null;
    if (!res.ok) {
      process.stderr.write(`  warn wiki ${title}: HTTP ${res.status}\n`);
      return null;
    }
    const body = await res.text();
    wikipediaCache[title] = body;
    saveJsonCache(wikipediaCachePath, wikipediaCache);
    return body;
  };

  const fetchImage: ImageBytesFetcher = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return Buffer.from(await res.arrayBuffer());
  };

  let ok = 0;
  let fail = 0;
  // Sequential worker — Wikipedia path needs polite rate-limiting; the
  // DESI fallback will naturally inherit it (we don't bother running
  // DESI in parallel because the typical run won't hit it for many
  // entries).
  for (const e of entries) {
    const outPath = resolve(outDir, `${e.id}.webp`);

    // Curator override short-circuit: if the maintainer has curated
    // this entry via tools/famous-curator, copy the hand-curated atlas
    // into the runtime slot and skip the Wikipedia/DESI chain entirely.
    // Honour --force by always overwriting.  We also treat the runtime
    // slot as stale whenever the curated source is newer — re-curating
    // a galaxy should land in the runtime without needing --force, or
    // the operator would silently ship the previous (pre-curation)
    // auto-fetched WebP after every re-export.
    if (curated.entries[e.id] !== undefined) {
      const curatedSrc = resolve('.', `public/images/famous-curated/${e.id}/atlas.webp`);
      const runtimeStale =
        existsSync(outPath) &&
        existsSync(curatedSrc) &&
        statSync(curatedSrc).mtimeMs > statSync(outPath).mtimeMs;
      if (existsSync(outPath) && !flags.force && !runtimeStale) {
        process.stderr.write(`  skip ${e.id} (curated, cached)\n`);
        ok++;
        continue;
      }
      try {
        copyCuratedAtlas(resolve('.'), e.id);
        const size = statSync(outPath).size;
        const tag = runtimeStale ? 'curated, refreshed' : 'curated';
        process.stderr.write(`  ok   ${e.id}  ${tag}  ${(size / 1024).toFixed(1)} KB\n`);
        ok++;
        continue;
      } catch (err) {
        process.stderr.write(
          `  warn ${e.id}: curated copy failed (${(err as Error).message}); falling back\n`,
        );
      }
    }

    if (existsSync(outPath) && !flags.force) {
      process.stderr.write(`  skip ${e.id} (cached)\n`);
      ok++;
      continue;
    }

    let success = false;

    // ── Wikipedia path ──────────────────────────────────────────────
    if (flags.sourcePreference === 'wikipedia') {
      const candidates = buildWikipediaTitleChain(e);
      const resolved = await resolveWikipediaImage(candidates, fetchBody);
      if (resolved !== null) {
        try {
          const imgBytes = await fetchImage(resolved.url);
          const webp = await processWikipediaImageBuffer(imgBytes);
          writeFileSync(outPath, webp);
          process.stderr.write(
            `  ok   ${e.id}  wikipedia (${resolved.title})  ${(webp.byteLength / 1024).toFixed(1)} KB\n`,
          );
          ok++;
          success = true;
        } catch (err) {
          process.stderr.write(
            `  warn ${e.id}: wikipedia image fetch failed (${(err as Error).message}); falling back\n`,
          );
        }
      } else {
        process.stderr.write(
          `  warn ${e.id}: no wikipedia image (tried ${candidates.length} titles); falling back\n`,
        );
      }
    }

    if (success) continue;

    // ── DESI fallback ───────────────────────────────────────────────
    const desi = await fetchDesiFallback(e);
    if (desi !== null) {
      writeFileSync(outPath, desi.webp);
      process.stderr.write(
        `  ok   ${e.id}  desi/${desi.landed}  ${(desi.webp.byteLength / 1024).toFixed(1)} KB\n`,
      );
      ok++;
    } else {
      process.stderr.write(`  fail ${e.id}: no image source\n`);
      fail++;
    }
  }

  // Save cache once more at the end (we save after every fetch already,
  // but a final save covers any race where a write was queued mid-run).
  saveJsonCache(wikipediaCachePath, wikipediaCache);

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
