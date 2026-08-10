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
import { collectDataManifest } from './r2/collectDataManifest';
import { collectEarthTileManifest } from './r2/collectEarthTileManifest';
import { collectEarthTiles } from './r2/collectEarthTiles';
import { collectExtraFiles, missingExtraFiles } from './r2/collectExtraFiles';
import { collectHiResImages } from './r2/collectHiResImages';
import { collectTextureImages } from './r2/collectTextureImages';
import { purgeCloudflareCache } from './r2/purgeCloudflareCache';
import { MISSING_CREDENTIALS_HELP, readRcloneCredentials } from './r2/rcloneEnv';
import { syncGroup, type R2SyncContext } from './r2/syncGroup';

const DATA_DIR = 'public/data';
const HIRES_DIR = 'public/data/images/famous-hires';
const TEXTURES_DIR = 'public/data/images/textures';
const IMAGES_DIR = 'public/data/images';

const BUCKET = 'skymap-data';
/**
 * One day. These artefacts are content-stable but not hash-fingerprinted (the
 * URL is hard-coded in the runtime), so this caps how long a stale catalog can
 * be served if the post-sync purge is skipped.
 */
const DAY = 'public, max-age=86400';
/** A given tile key's bytes never change once baked, so it can cache forever. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** For the one pointer file whose bytes are expected to change every sync. */
const NO_CACHE = 'public, max-age=0, must-revalidate';

/** Public URL the CDN serves R2 from — single source of truth in `.env.production`. */
const R2_PUBLIC_URL = readEnvProductionValue('VITE_DATA_BASE_URL');

function buildGroups(): R2SyncGroup[] {
  return [
    {
      label: 'public/data',
      files: collectDataFiles(DATA_DIR),
      transport: { kind: 'wrangler' },
      // Every upload here is content-hashed by build-data-manifest, so the
      // bytes at a given key never change — no TTL to wait out, no purge to run.
      cacheControl: IMMUTABLE,
      purge: false,
    },
    {
      label: 'Hi-res famous-galaxy images',
      files: collectHiResImages(HIRES_DIR),
      transport: { kind: 'wrangler' },
      cacheControl: DAY,
      purge: true,
    },
    {
      label: 'Planet-surface textures',
      files: collectTextureImages(TEXTURES_DIR),
      transport: { kind: 'wrangler' },
      cacheControl: DAY,
      purge: true,
    },
    {
      label: 'Extra files',
      files: collectExtraFiles(),
      transport: { kind: 'wrangler' },
      cacheControl: DAY,
      purge: true,
    },
    {
      label: 'Earth surface tiles',
      files: collectEarthTiles(IMAGES_DIR),
      transport: { kind: 'bulk', localRoot: IMAGES_DIR, keyRoot: 'data/images' },
      cacheControl: IMMUTABLE,
      purge: false,
    },
    // Must come after 'Earth surface tiles': it's the pointer the runtime
    // reads to discover tiles, so it must never name tiles that this same
    // run hasn't finished uploading.
    {
      label: 'Earth tile manifest',
      files: collectEarthTileManifest(IMAGES_DIR),
      transport: { kind: 'wrangler' },
      cacheControl: DAY,
      purge: true,
    },
    // Must stay last of all: it's the pointer the runtime reads to resolve
    // every logical data path, so it must never name a hashed file this run
    // hasn't finished uploading — the same rule as the Earth tile manifest
    // above, one level up.
    {
      label: 'Data manifest',
      files: collectDataManifest(DATA_DIR),
      transport: { kind: 'wrangler' },
      cacheControl: NO_CACHE,
      purge: true,
    },
  ];
}

async function main(): Promise<void> {
  const groups = buildGroups();
  const total = groups.reduce((n, g) => n + g.files.length, 0);
  if (total === 0) {
    console.error(`No matching files in ${DATA_DIR}.  Run npm run build-tiers first.`);
    process.exit(1);
  }

  // Fail before the first byte moves rather than part-way through: a run that
  // uploads some groups and then dies on a missing credential leaves the
  // bucket in a state no one asked for.
  const rcloneCredentials = readRcloneCredentials();
  const needsRclone = groups.some((g) => g.transport.kind === 'bulk' && g.files.length > 0);
  if (needsRclone && rcloneCredentials === null) {
    console.error(MISSING_CREDENTIALS_HELP);
    process.exit(1);
  }

  console.log(
    `Syncing ${total} file(s) to r2://${BUCKET}/data/\n` +
      groups.map((g) => `  ${g.files.length.toString().padStart(6)}  ${g.label}`).join('\n'),
  );

  const ctx: R2SyncContext = {
    bucket: BUCKET,
    publicUrl: R2_PUBLIC_URL,
    rcloneCredentials,
  };
  // Every key we wrote that the CDN must be told about. Groups whose content
  // is immutable by construction stay out of this list on purpose.
  const touchedKeys: string[] = [];
  let uploaded = 0;
  let delegated = 0;
  for (const group of groups) {
    const result = await syncGroup(group, ctx, touchedKeys);
    uploaded += result.uploaded;
    delegated += result.delegated;
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
      ` (${uploaded} uploaded, ${total - uploaded - delegated} unchanged` +
      (delegated > 0 ? `, ${delegated} via rclone — see its stats above` : '') +
      ')',
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
