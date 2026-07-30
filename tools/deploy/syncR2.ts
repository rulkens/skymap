/**
 * Publish the deploy artefacts to the `skymap-data` R2 bucket.
 *
 * The .bin catalogs are gitignored build outputs (~370 MB) that blow past
 * Workers Assets' per-file cap and don't change on every code push, so the
 * static shell and the data ship on separate tracks — see docs/DEPLOY.md.
 *
 * This file is the entry point and nothing else: it assembles the GROUPS
 * table and runs it. Selection, transport, diffing and purging live in `r2/`.
 */
import { fileURLToPath } from 'node:url';
import { readEnvProductionValue } from '../utils/io/readEnvProductionValue';
import type { R2SyncGroup } from './r2/R2SyncGroup';
import { collectDataFiles } from './r2/collectDataFiles';
import { collectExtraFiles, missingExtraFiles } from './r2/collectExtraFiles';
import { collectHiResImages } from './r2/collectHiResImages';
import { collectTextureImages } from './r2/collectTextureImages';
import { purgeCloudflareCache } from './r2/purgeCloudflareCache';
import { syncGroup, type R2SyncContext } from './r2/syncGroup';

const DATA_DIR = 'public/data';
const HIRES_DIR = 'public/data/images/famous-hires';
const TEXTURES_DIR = 'public/data/images/textures';

const BUCKET = 'skymap-data';
/**
 * One day. The bins are content-stable but not hash-fingerprinted (the URL is
 * hard-coded in the runtime), so this caps how long a stale catalog can be
 * served if the post-sync purge is skipped.
 */
const CACHE_CONTROL = 'public, max-age=86400';

/** Public URL the CDN serves R2 from — single source of truth in `.env.production`. */
const R2_PUBLIC_URL = readEnvProductionValue('VITE_DATA_BASE_URL');

function buildGroups(): R2SyncGroup[] {
  return [
    { label: 'public/data', files: collectDataFiles(DATA_DIR) },
    { label: 'Hi-res famous-galaxy images', files: collectHiResImages(HIRES_DIR) },
    { label: 'Planet-surface textures', files: collectTextureImages(TEXTURES_DIR) },
    { label: 'Extra files', files: collectExtraFiles() },
  ];
}

async function main(): Promise<void> {
  const groups = buildGroups();
  const total = groups.reduce((n, g) => n + g.files.length, 0);
  if (total === 0) {
    console.error(`No matching files in ${DATA_DIR}.  Run npm run build-tiers first.`);
    process.exit(1);
  }

  console.log(
    `Syncing ${total} file(s) to r2://${BUCKET}/data/\n` +
      groups.map((g) => `  ${g.files.length.toString().padStart(6)}  ${g.label}`).join('\n'),
  );

  const ctx: R2SyncContext = {
    bucket: BUCKET,
    publicUrl: R2_PUBLIC_URL,
    cacheControl: CACHE_CONTROL,
  };
  // Every key we actually wrote, so the purge below knows what to evict.
  const touchedKeys: string[] = [];
  for (const group of groups) {
    await syncGroup(group, ctx, touchedKeys);
  }

  const missing = missingExtraFiles();
  if (missing.length > 0) {
    console.log('\n⚠ Skipped (file not present locally):');
    for (const { localPath } of missing) console.log(`  ${localPath}`);
    console.log(
      '  To include, run `npm run fetch-hyperleda` then `gzip -k -9 data/raw/hyperleda/hyperleda_pa.csv`.',
    );
  }

  console.log(
    `\n✓ Synced ${total} file(s) to r2://${BUCKET}/data/` +
      ` (${touchedKeys.length} uploaded, ${total - touchedKeys.length} unchanged)`,
  );

  console.log('\n--- Cloudflare CDN cache purge ---\n');
  if (touchedKeys.length === 0) {
    console.log('  nothing changed — edge cache already current.');
  } else {
    await purgeCloudflareCache(touchedKeys, R2_PUBLIC_URL);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
