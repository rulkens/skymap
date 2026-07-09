/**
 * Upload public/data/*.bin (and the famous_*.json sidecars) to the
 * skymap-data R2 bucket, preserving the `data/` key prefix the runtime
 * cloudLoader expects.
 *
 * ### Why this script exists at all
 *
 * The catalog .bin files are deploy artefacts: deterministic outputs of
 * `tools/buildAllBins.ts` against the raw catalogs in `data/raw/`.  They
 * are gitignored (~370 MB across all tiers), too large for Workers Assets'
 * per-file size cap, and don't change on every code push.  R2 is the
 * natural home: zero egress, generous free tier, public custom domain
 * (`skymap-data.rulkens.com`) maps cleanly onto the `${VITE_DATA_BASE_URL}/data/...`
 * URL pattern the runtime fetcher uses.  This script is what gets a fresh
 * build of the bins from `public/data/` (where Vite has them for local dev)
 * up to R2 (where the prod bundle fetches them from).
 *
 * ### Cache-Control
 *
 * `public, max-age=86400` — one-day cache.  The .bin files are content-
 * stable while the catalog generation pipeline stays deterministic, but
 * they're not hash-fingerprinted (the URL is hard-coded in the runtime),
 * so a 24h cap is the right balance between caching and the ability to
 * push a fresh catalogue without waiting a year for browsers to expire.
 *
 * ### CDN cache purge
 *
 * R2 PUTs are immediate but the Cloudflare edge holds the previous bytes
 * for the full `max-age` window.  After the upload sweep the script hits
 * `POST /zones/{id}/purge_cache` with every key it touched (chunked at 30,
 * CF's per-request cap).  Configured via `CLOUDFLARE_API_TOKEN` +
 * `CLOUDFLARE_ZONE_ID`; missing either skips the purge and prints a
 * dashboard-purge fallback message — upload is the source of truth, purge
 * is just a CDN-eviction hint.
 *
 * ### Idempotency
 *
 * Re-running re-uploads everything.  R2 PUT replaces the object atomically;
 * no atomic-rename dance needed.  For a faster sync that skips unchanged
 * files, hash + compare ETags — out of scope for the initial migration where
 * the bucket starts empty.
 *
 * ### File set
 *
 * The ALLOW filter mirrors the runtime fetch surface: tier-suffixed
 * SDSS/GLADE bins, the unsuffixed 2mrs.bin / famous.bin / filaments.bin,
 * and the famous JSON sidecar.  (The pgc_aliases.json palette-search map is
 * also runtime-fetched but ships via EXTRA_FILES — it's a committed data/
 * source artefact, not a public/data build output.)
 * The legacy un-tiered glade.bin / sdss.bin
 * are deliberately skipped — they're pre-tier-system build artefacts only
 * used by the offline DisPerSE pipeline, never fetched from the browser.
 * Likewise the diagnostic filaments-sdss.bin (the SDSS-only DisPerSE build
 * for the wedge-pollution sanity check) is not part of the runtime.
 *
 * A second sweep walks `public/data/images/famous-hires/` and uploads each
 * `<id>.webp` to `data/images/famous-hires/<id>.webp` in R2.  These are the
 * hi-res WebPs the close-approach LOD requests via `dataUrl()`.  Kept as
 * a separate sweep (rather than folded into ALLOW) because the existing
 * sweep is flat — `readdirSync(DATA_DIR)` doesn't descend into the `images/`
 * subdir — and because a recursive walk would risk picking up unrelated
 * files Vite drops into `public/data/`.
 *
 * ### Extra files: data/raw/
 *
 * Some files live outside `public/data/` and don't fit the runtime-fetch
 * pattern, but are still useful to distribute via R2 — specifically build-time
 * enrichment caches that contributors would otherwise have to regenerate from
 * upstream services.  `hyperleda_pa.csv.gz` is the canonical example: it's a
 * ~1.5 M-row position-angle cache fetched from HyperLEDA over ~1 hour, gzipped
 * for transport.  It's a build artefact in the same spirit as the .bin files —
 * deterministic output of a slow external fetch, not a source file — so R2 is
 * the right distribution vehicle (egress-free, decoupled from release tags,
 * infra already exists).  Using R2 here instead of a GitHub release asset has
 * three concrete advantages:
 *
 *  1. No size or per-release cap to worry about.
 *  2. Cache refreshes don't require cutting a new tag or editing a release.
 *  3. Consistent `curl` URL pattern for contributors — same host, same path
 *     prefix, regardless of whether the file is a .bin or a .csv.gz.
 *
 * These extra files are uploaded with the same Cache-Control as the .bin files.
 * They are tracked in EXTRA_FILES below and uploaded after the main public/data
 * sweep so the two concerns remain visually separable in the script.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readEnvProductionValue } from '../utils/io/readEnvProductionValue';
import { RAW_DATA } from '../utils/io/rawDataRegistry';
import { collectHiResImages } from './collectHiResImages';

const DATA_DIR = 'public/data';
/**
 * The flat hi-res WebP directory written by `tools/famous/copyHiResToPublic.ts`.
 * Listed explicitly (rather than via a recursive walk of public/data/) so we
 * don't accidentally sweep up other files Vite or future build steps drop into
 * public/data/.  See `collectHiResImages.ts` for the inventory contract.
 */
const HIRES_DIR = 'public/data/images/famous-hires';
const BUCKET = 'skymap-data';
const CACHE_CONTROL = 'public, max-age=86400';

/** Public URL the Cloudflare CDN serves R2 from — single source of truth in `.env.production`. */
const R2_PUBLIC_URL = readEnvProductionValue('VITE_DATA_BASE_URL');

export const ALLOW = (name: string): boolean =>
  /^(sdss|glade)-(small|medium|large)\.bin$/.test(name) ||
  // Milliquas v8 (Flesch 2023): same tier-suffixed pattern as
  // SDSS/GLADE.  Class + parent-survey metadata rides on the bin
  // itself — no JSON sidecar to upload.
  /^milliquas-(small|medium|large)\.bin$/.test(name) ||
  name === '2mrs.bin' ||
  name === 'famous.bin' ||
  // DESI DR1 deep-cone catalog — a single fixed 2.5° patch around Corona
  // Borealis, built by `npm run build-tiers` from the four DESI LSS tracer
  // files in data/raw/desi/.  Tier-agnostic like 2mrs.bin (the cone is a
  // fixed region, not a tiered downsample), so there is no desi-deep-*.bin.
  name === 'desi-deep.bin' ||
  // DESI DR1 dec-band wedge — a second fixed patch (2.5°-thick declination
  // band across the Corona Borealis arm) built by `npm run build-tiers`
  // alongside the cone. Tier-agnostic like desi-deep.bin.
  name === 'desi-wedge.bin' ||
  // DESI DR1 Sloan Great Wall — a third fixed patch (a bounded volume isolating
  // the Sloan Great Wall, sculpted as an ellipsoid union) built by
  // `npm run build-tiers` alongside the cone + wedge. Tier-agnostic.
  name === 'desi-sgw.bin' ||
  name === 'filaments.bin' ||
  // The small-tier filament variant — built by `npm run build-filaments-small`
  // with a higher DisPerSE persistence cut.  Roughly half the size of the
  // full file, used as the mobile-default skeleton.  See
  // cloudLoader.filamentFilenameForTier().
  name === 'filaments-small.bin' ||
  name === 'famous_meta.json' ||
  // NB: pgc_aliases.json is NOT here — it's a committed source artefact in
  // data/ (an expensive HyperLEDA pull, not a local build output), so it
  // ships via EXTRA_FILES below, same as the data/raw/ enrichment files.
  // Valade 2024 CF-4 HAMLET 256³ DM density cube, written as SCFD by
  // `npm run build-cf4-density` from the maintainer-produced .npy.
  // See data/raw/cf4/README.md for the maintainer + contributor paths.
  name === 'cf4_density.scfd' ||
  // MCPM Cosmic Web density cubes — SDSS DR17 Cosmic Slime VAC
  // (Wilde et al. 2023), tiered downsamples emitted by
  // `npm run build-mcpm` from the .npy tiers in data/raw/mcpm/.
  /^mcpm-(small|medium|large)\.scfd$/.test(name) ||
  // CF4++ peculiar-velocity field — a single SCFD cube (channels=4,
  // value_kind=1; frame + velocity/δ stats fold into the header, no sidecar)
  // emitted by `npm run build-flow-field`.  Tier-agnostic, like filaments.bin.
  name === 'flowfield.scfd' ||
  // Cluster/supercluster coverage artefacts (MCXC + MSCC + featured seed)
  // emitted by `npm run build-structures`: the packed point catalog and its
  // per-structure metadata sidecar.  Tier-agnostic, like famous.bin.
  name === 'structures.ccat' ||
  name === 'structures_meta.json';

/**
 * Decide whether a local file is byte-identical to the object already in R2,
 * so an unchanged file can be skipped instead of re-uploaded.
 *
 * R2 records a single-PUT object's ETag as the lowercase hex MD5 of its
 * content; HTTP wraps it in double quotes and a weak validator prepends `W/`.
 * Every file this script uploads goes up as a single PUT — wrangler
 * `r2 object put` has no multipart path and our largest artefact (the ~297 MB
 * MCPM tier) stays under its ~300 MiB cap — so a plain whole-file MD5
 * comparison is exact.
 *
 * A composite multipart ETag (`<hash>-<partCount>`) can't be reproduced from
 * the whole-file MD5, so we treat it as a non-match and re-upload: correctness
 * over the marginal bandwidth saving.  A missing object (null/empty ETag — a
 * 404 on first sync) is likewise a non-match.
 */
export const etagMatches = (localMd5: string, remoteEtag: string | null): boolean => {
  if (!remoteEtag) return false;
  const normalized = remoteEtag
    .replace(/^W\//, '') // weak-validator prefix
    .replace(/^"|"$/g, '') // surrounding double quotes
    .toLowerCase();
  if (normalized.includes('-')) return false; // multipart composite — uncomparable
  return normalized === localMd5.toLowerCase();
};

/**
 * Extra files outside public/data/ that should also land in R2.
 *
 * Each entry is `{ localPath, r2Key }` where `r2Key` is the path inside the
 * bucket.  Most entries use a `data/` prefix to keep skymap build artefacts
 * under the same R2 namespace whether they are runtime-fetched by the
 * browser (.bin) or contributor-downloaded during local setup (.csv.gz).
 * The exception is bucket-infrastructure files like `robots.txt`, which
 * must live at the host root to be honoured by crawlers.
 *
 * Why keep these separate from the ALLOW filter rather than moving
 * hyperleda_pa.csv.gz into public/data/ first?  The file belongs
 * conceptually in data/raw/ — it's a raw-catalog enrichment file, not a
 * browser-served asset.  Copying or symlinking it into public/data/ just
 * to satisfy the existing scan would muddy that boundary and risk Vite
 * accidentally serving the compressed gzip during dev.  A short explicit
 * list of extra files is cleaner than bending the directory convention.
 */
type ExtraFile = { localPath: string; r2Key: string };

const EXTRA_FILES: ExtraFile[] = [
  {
    // robots.txt at the bucket root, disallowing all crawlers.  The data
    // subdomain serves only binary .bin catalogs + a few JSON sidecars —
    // no human-readable content — so indexing it wastes crawler budget
    // and bucket requests for zero SEO value.  Lives at the root key
    // (no `data/` prefix) because robots.txt is only honoured when fetched
    // from the host root.  Source file is checked in at tools/deploy/r2-static/.
    localPath: 'tools/deploy/r2-static/robots.txt',
    r2Key: 'robots.txt',
  },
  {
    // PGC→names map for the Cmd+K palette's alias search.  A committed source
    // artefact in data/ (an expensive HyperLEDA designations pull — see
    // tools/fetch/buildPgcAliases.ts), NOT a public/data build output, so it
    // rides EXTRA_FILES like the data/raw/ enrichment files rather than the
    // ALLOW scan.  The r2Key matches dataUrl('pgc_aliases.json') ===
    // <base>/data/pgc_aliases.json, lazily fetched on first palette open.
    localPath: 'data/pgc_aliases.json',
    r2Key: 'data/pgc_aliases.json',
  },
  {
    // HyperLEDA position-angle + isophotal-diameter cache.
    // Built once by `npm run fetch-hyperleda` (~1 hour), then gzipped:
    //   gzip -k -9 data/raw/hyperleda/hyperleda_pa.csv
    // Contributors download it instead of re-fetching:
    //   curl -L -o data/raw/hyperleda/hyperleda_pa.csv.gz \
    //     https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz
    //   gunzip data/raw/hyperleda/hyperleda_pa.csv.gz
    localPath: RAW_DATA['hyperleda.pa-gz'].path,
    r2Key: 'data/hyperleda_pa.csv.gz',
  },
  {
    // CF-4 DM mean-density 128³ cube — the `d_mean_CF4pp` array extracted
    // from the Courtois 2025 CF4++ release.  Maintainer pulls the upstream
    // 167 MB `CF4pp_mean_std_grids.npz` from
    // https://projets.ip2i.in2p3.fr/cosmicflows/ and runs
    //
    //   unzip -j CF4pp_mean_std_grids.npz d_mean_CF4pp.npy \
    //     -d data/raw/cf4/
    //
    // The ~8 MB result is uploaded here so contributors can curl it
    // instead of downloading the full ensemble (mean + std for density,
    // 3-component velocity, and radial velocity = 6 arrays they don't
    // need).  Same EXTRA_FILES pattern as hyperleda_pa.csv.gz: a
    // slow-external-fetch artefact in data/raw/, not public/data/, so
    // the ALLOW filter doesn't see it.
    localPath: RAW_DATA['cf4.density-mean'].path,
    r2Key: RAW_DATA['cf4.density-mean'].path,
  },
  {
    // CF4++ mean *velocity* 128³×3 cube — the `v_mean_CF4pp` array extracted
    // from the same Courtois 2025 ensemble as `d_mean` above.  The flow-field
    // build (`npm run build-flow-field`) packs v_mean + d_mean into
    // `flowfield.scfd`, so a contributor needs BOTH slices, not just the
    // density one.  Uploaded here (~50 MB) for the same reason as d_mean: so
    // contributors curl the slice instead of the full 167 MB ensemble.  Same
    // maintainer extraction, one extra member:
    //
    //   unzip -j CF4pp_mean_std_grids.npz v_mean_CF4pp.npy d_mean_CF4pp.npy \
    //     -d data/raw/cf4/
    localPath: RAW_DATA['cf4.vfield-mean'].path,
    r2Key: RAW_DATA['cf4.vfield-mean'].path,
  },
  ...([8, 4, 2] as const).map((factor) => ({
    // MCPM Cosmic Web .npy tier — block-averaged downsample of the SDSS
    // DR17 Cosmic Slime VAC trace.bin.bz2, produced by
    // `python tools/extractMcpmCube.py`. Contributors curl these instead
    // of installing pyslime + the 345 MB upstream blob.
    localPath: join(RAW_DATA['mcpm.dir'].path, `mcpm_sdss_d${factor}.npy`),
    r2Key: join(RAW_DATA['mcpm.dir'].path, `mcpm_sdss_d${factor}.npy`),
  })),
];

function uploadFile(localPath: string, key: string): void {
  const sizeMB = (statSync(localPath).size / 1024 / 1024).toFixed(1);
  console.log(`▶ ${localPath} (${sizeMB} MB) → r2://${BUCKET}/${key}`);
  // `--remote` forces upload to the actual Cloudflare-hosted bucket
  // rather than wrangler's local-dev simulator.  `--force` skips the
  // interactive data-catalog validation prompt so the script runs
  // unattended over a long sync.
  execSync(
    `npx wrangler r2 object put ${BUCKET}/${key}` +
      ` --file ${localPath}` +
      ` --cache-control "${CACHE_CONTROL}"` +
      ` --remote --force`,
    { stdio: 'inherit' },
  );
}

/** Hex MD5 of a file's bytes — the digest R2 reports as a single-PUT object's ETag. */
function localMd5(localPath: string): string {
  return createHash('md5').update(readFileSync(localPath)).digest('hex');
}

/**
 * The remote object's ETag, or null if it's absent / unreadable.
 *
 * wrangler exposes no metadata-only read (its `r2 object get` downloads the
 * body), so we HEAD the public URL — the CDN/R2 returns the ETag header
 * without transferring the object.  A cached edge response is still the ETag
 * of the stored object, so the only failure mode is an occasional needless
 * re-upload, never a wrong skip.
 */
async function remoteEtag(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? res.headers.get('etag') : null;
  } catch {
    return null;
  }
}

/**
 * Upload `localPath` to `key` unless R2 already holds byte-identical content.
 *
 * Skipping unchanged files keeps a metadata-sized change (a few KB of
 * famous_meta.json) from dragging the whole ~370 MB artefact set across the
 * wire each sync — and, because the largest tiers are skipped when unchanged,
 * stops a flaky multi-hundred-MB upload from aborting the run before the CDN
 * purge.  A skipped file is left out of `touchedKeys`: its edge cache already
 * matches the origin, so there's nothing to purge.
 */
async function uploadIfChanged(
  localPath: string,
  key: string,
  touchedKeys: string[],
): Promise<void> {
  const remote = await remoteEtag(`${R2_PUBLIC_URL}/${key}`);
  if (remote && etagMatches(localMd5(localPath), remote)) {
    const sizeMB = (statSync(localPath).size / 1024 / 1024).toFixed(1);
    console.log(`= ${localPath} (${sizeMB} MB) unchanged — skip`);
    return;
  }
  uploadFile(localPath, key);
  touchedKeys.push(key);
}

/**
 * Purge the Cloudflare CDN's edge cache for every R2 key we touched.
 *
 * R2 uploads are atomic, but the CDN in front of R2 caches GETs by URL
 * for the full `max-age=86400` window — so without an explicit purge,
 * users continue to receive the OLD bytes for up to 24 hours after a
 * sync.  Auto-purging here closes the gap.
 *
 * Configuration via env (matching wrangler's own conventions so a
 * single CF token can be reused):
 *
 *   - `CLOUDFLARE_API_TOKEN` — token with `Zone:Cache Purge` scope
 *     on the rulkens.com zone.
 *   - `CLOUDFLARE_ZONE_ID` — the rulkens.com zone id (Cloudflare
 *     dashboard → Overview → "Zone ID" on the right).
 *
 * If either is missing the script logs a clear instruction and skips
 * the purge rather than failing the whole sync — the upload itself
 * succeeded, and a manual dashboard purge is always available as a
 * fallback.  Treating purge as best-effort matches its conceptual
 * status: a CDN-eviction hint, not the source of truth.
 *
 * Cloudflare's per-request file cap is 30, so we chunk longer lists.
 */
async function purgeCloudflareCache(keys: ReadonlyArray<string>): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    console.log(
      '\n⚠ CDN cache NOT purged: set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID to auto-purge.',
    );
    console.log(
      `  Manual purge: Cloudflare dashboard → Caching → Purge Cache → "Custom" → paste the ${keys.length} URL(s) under ${R2_PUBLIC_URL}/.`,
    );
    return;
  }

  const urls = keys.map((k) => `${R2_PUBLIC_URL}/${k}`);
  const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;

  for (let i = 0; i < urls.length; i += 30) {
    const batch = urls.slice(i, i + 30);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: batch }),
    });
    const body = (await res.json()) as { success?: boolean; errors?: { message: string }[] };
    if (!res.ok || !body.success) {
      const msg = body.errors?.map((e) => e.message).join('; ') ?? `HTTP ${res.status}`;
      throw new Error(`Cloudflare purge failed: ${msg}`);
    }
    console.log(`  purged ${batch.length} URL(s)`);
  }
}

async function main(): Promise<void> {
  const files = readdirSync(DATA_DIR).filter(ALLOW);
  if (files.length === 0) {
    console.error(`No matching files in ${DATA_DIR}.  Run npm run build-tiers first.`);
    process.exit(1);
  }

  // Count extra files that actually exist on disk (they may not be present on
  // a fresh checkout — the CSV is gitignored, and the .gz won't exist until
  // the user runs `npm run fetch-hyperleda` + gzip).
  const presentExtras = EXTRA_FILES.filter((f) => existsSync(f.localPath));

  // Hi-res famous-galaxy WebPs from `public/data/images/famous-hires/`.
  // Built by `npm run build-famous-hires`; missing on a fresh checkout that
  // hasn't run the curator yet, which is fine — the inventory helper returns
  // [] in that case.  Each upload becomes `data/images/famous-hires/<id>.webp`
  // so `dataUrl('images/famous-hires/<id>.webp')` resolves at runtime.
  const hiResImages = collectHiResImages(HIRES_DIR);

  console.log(
    `Syncing ${files.length} public/data files` +
      (hiResImages.length > 0 ? ` + ${hiResImages.length} hi-res image(s)` : '') +
      (presentExtras.length > 0 ? ` + ${presentExtras.length} extra file(s)` : '') +
      ` to r2://${BUCKET}/data/\n`,
  );

  // Track every R2 key we touch so the CDN purge below knows which URLs
  // to invalidate.  Collecting in lock-step with the upload calls keeps
  // the two from drifting if a future ALLOW filter / EXTRA_FILES change
  // adds a new asset.
  const touchedKeys: string[] = [];

  for (const name of files) {
    await uploadIfChanged(join(DATA_DIR, name), `data/${name}`, touchedKeys);
  }

  if (hiResImages.length > 0) {
    console.log('\n--- Hi-res famous-galaxy images ---\n');
    for (const { localPath, r2Key } of hiResImages) {
      await uploadIfChanged(localPath, r2Key, touchedKeys);
    }
  }

  if (presentExtras.length > 0) {
    console.log('\n--- Extra files ---\n');
    for (const { localPath, r2Key } of presentExtras) {
      await uploadIfChanged(localPath, r2Key, touchedKeys);
    }
  }

  const skippedExtras = EXTRA_FILES.filter((f) => !existsSync(f.localPath));
  if (skippedExtras.length > 0) {
    console.log('\n⚠ Skipped (file not present locally):');
    for (const { localPath } of skippedExtras) {
      console.log(`  ${localPath}`);
    }
    console.log(
      '  To include, run `npm run fetch-hyperleda` then `gzip -k -9 data/raw/hyperleda/hyperleda_pa.csv`.',
    );
  }

  const total = files.length + hiResImages.length + presentExtras.length;
  const uploaded = touchedKeys.length;
  console.log(
    `\n✓ Synced ${total} file(s) to r2://${BUCKET}/data/` +
      ` (${uploaded} uploaded, ${total - uploaded} unchanged)`,
  );

  // Only changed files need a CDN purge — skipped objects already match the
  // edge.  An empty list short-circuits inside purgeCloudflareCache.
  console.log('\n--- Cloudflare CDN cache purge ---\n');
  if (touchedKeys.length === 0) {
    console.log('  nothing changed — edge cache already current.');
  } else {
    await purgeCloudflareCache(touchedKeys);
  }
}

// Allow the script to be both executed (CLI) and imported (tests for ALLOW).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
