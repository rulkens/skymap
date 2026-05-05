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
 * (`data.skymap.rulkens.com`) maps cleanly onto the `${VITE_DATA_BASE_URL}/data/...`
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
 */
import { readdirSync, statSync } from 'node:fs';
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
  name === 'famous_xrefs.json';

function main(): void {
  const files = readdirSync(DATA_DIR).filter(ALLOW);
  if (files.length === 0) {
    console.error(`No matching files in ${DATA_DIR}.  Run npm run build-tiers first.`);
    process.exit(1);
  }

  console.log(`Syncing ${files.length} files to r2://${BUCKET}/data/\n`);

  for (const name of files) {
    const localPath = join(DATA_DIR, name);
    const sizeMB = (statSync(localPath).size / 1024 / 1024).toFixed(1);
    const key = `data/${name}`;
    console.log(`▶ ${name} (${sizeMB} MB) → r2://${BUCKET}/${key}`);
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

  console.log(`\n✓ Synced ${files.length} files to r2://${BUCKET}/data/`);
}

main();
