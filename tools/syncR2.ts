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
 * `public, max-age=86400` — one-day cache, matching the firebase.json rule
 * that ran before the migration.  The .bin files are content-stable for as
 * long as the catalog generation pipeline stays deterministic, but they're
 * not hash-fingerprinted (the URL is hard-coded in the runtime), so a 24h
 * cap is the right balance between caching and the ability to push a fresh
 * catalogue without waiting a year for browsers to expire.
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
 * plus the famous JSON sidecars.  The legacy un-tiered glade.bin / sdss.bin
 * are deliberately skipped — they're pre-tier-system build artefacts only
 * used by the offline DisPerSE pipeline, never fetched from the browser.
 * Likewise the diagnostic filaments-sdss.bin (the SDSS-only DisPerSE build
 * for the wedge-pollution sanity check) is not part of the runtime.
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
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const DATA_DIR = 'public/data';
const BUCKET = 'skymap-data';
const CACHE_CONTROL = 'public, max-age=86400';

const ALLOW = (name: string): boolean =>
  /^(sdss|glade)-(small|medium|large)\.bin$/.test(name) ||
  name === '2mrs.bin' ||
  name === 'famous.bin' ||
  name === 'filaments.bin' ||
  // The small-tier filament variant — built by `npm run build-filaments-small`
  // with a higher DisPerSE persistence cut.  Roughly half the size of the
  // full file, used as the mobile-default skeleton.  See
  // cloudLoader.filamentFilenameForTier().
  name === 'filaments-small.bin' ||
  name === 'famous_meta.json' ||
  name === 'famous_xrefs.json' ||
  // Valade 2024 CF-4 HAMLET 256³ DM density cube, written as SCFD by
  // `npm run build-cf4-density` from the maintainer-produced .npy.
  // See data/raw/cf4/README.md for the maintainer + contributor paths.
  name === 'cf4_density.scfd' ||
  // MCPM Cosmic Web density cubes — SDSS DR17 Cosmic Slime VAC
  // (Wilde et al. 2023), tiered downsamples emitted by
  // `npm run build-mcpm` from the .npy tiers in data/raw/mcpm/.
  /^mcpm-(small|medium|large)\.scfd$/.test(name);

/**
 * Extra files outside public/data/ that should also land in R2.
 *
 * Each entry is `{ localPath, r2Key }` where `r2Key` is the path inside the
 * bucket.  The `data/` prefix is intentional — it keeps all skymap build
 * artefacts under the same R2 namespace whether they are runtime-fetched
 * by the browser (.bin) or contributor-downloaded during local setup
 * (.csv.gz).
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
    // HyperLEDA position-angle + isophotal-diameter cache.
    // Built once by `npm run fetch-hyperleda` (~1 hour), then gzipped:
    //   gzip -k -9 data/raw/hyperleda_pa.csv
    // Contributors download it instead of re-fetching:
    //   curl -L -o data/raw/hyperleda_pa.csv.gz \
    //     https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz
    //   gunzip data/raw/hyperleda_pa.csv.gz
    localPath: 'data/raw/hyperleda_pa.csv.gz',
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
    localPath: 'data/raw/cf4/d_mean_CF4pp.npy',
    r2Key: 'data/raw/cf4/d_mean_CF4pp.npy',
  },
  ...([8, 4, 2] as const).map((factor) => ({
    // MCPM Cosmic Web .npy tier — block-averaged downsample of the SDSS
    // DR17 Cosmic Slime VAC trace.bin.bz2, produced by
    // `python tools/extractMcpmCube.py`. Contributors curl these instead
    // of installing pyslime + the 345 MB upstream blob.
    localPath: `data/raw/mcpm/mcpm_sdss_d${factor}.npy`,
    r2Key: `data/raw/mcpm/mcpm_sdss_d${factor}.npy`,
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

function main(): void {
  const files = readdirSync(DATA_DIR).filter(ALLOW);
  if (files.length === 0) {
    console.error(`No matching files in ${DATA_DIR}.  Run npm run build-tiers first.`);
    process.exit(1);
  }

  // Count extra files that actually exist on disk (they may not be present on
  // a fresh checkout — the CSV is gitignored, and the .gz won't exist until
  // the user runs `npm run fetch-hyperleda` + gzip).
  const presentExtras = EXTRA_FILES.filter((f) => existsSync(f.localPath));

  console.log(
    `Syncing ${files.length} public/data files` +
      (presentExtras.length > 0 ? ` + ${presentExtras.length} extra file(s)` : '') +
      ` to r2://${BUCKET}/data/\n`,
  );

  for (const name of files) {
    uploadFile(join(DATA_DIR, name), `data/${name}`);
  }

  if (presentExtras.length > 0) {
    console.log('\n--- Extra files ---\n');
    for (const { localPath, r2Key } of presentExtras) {
      uploadFile(localPath, r2Key);
    }
  }

  const skippedExtras = EXTRA_FILES.filter((f) => !existsSync(f.localPath));
  if (skippedExtras.length > 0) {
    console.log('\n⚠ Skipped (file not present locally):');
    for (const { localPath } of skippedExtras) {
      console.log(`  ${localPath}`);
    }
    console.log(
      '  To include, run `npm run fetch-hyperleda` then `gzip -k -9 data/raw/hyperleda_pa.csv`.',
    );
  }

  const total = files.length + presentExtras.length;
  console.log(`\n✓ Synced ${total} file(s) to r2://${BUCKET}/data/`);
}

main();
