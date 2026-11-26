#!/usr/bin/env node
/**
 * `npm run build-live-clouds` — the clouds row of the live datasets (src/data/live/liveDatasets.ts):
 * bakes yesterday (UTC), writes and checks the three grey tiers in a temp folder, copies them into a
 * dated live folder, and only then moves the pointer. A failing step exits non-zero with neither the
 * live folder nor the pointer touched; the bake's own exit code passes through, so 3 (retry later)
 * stays distinguishable from 2 and 4 (page a human).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TIER_LADDER } from '../../packages/shared/src/data/tierLadder';
import { bodyTextureFilename } from '../../src/utils/bodyTextures/bodyTextureFilename';
import { liveFilePath } from '../../src/utils/live/liveFilePath';
import { liveFolderStamp } from '../../src/utils/live/liveFolderStamp';
import { tierToTexturePx } from '../../src/utils/math/tierToTexturePx';
import { writeCloudTier } from '../textures/writeCloudTier';
import { PROJECT_ROOT } from '../utils/io/projectRoot';
import { writeLivePointer } from '../utils/live/writeLivePointer';
import { yesterdayUtc } from '../utils/time/yesterdayUtc';
import { checkCloudTier } from './checkCloudTier';

function npmRun(script: string, args: readonly string[]): number {
  return spawnSync('npm', ['run', '-s', script, '--', ...args], { stdio: 'inherit' }).status ?? 1;
}

/** Resolves to the process exit code. */
async function main(): Promise<number> {
  const builtAt = new Date();
  const date = yesterdayUtc(builtAt);
  const dataRoot = join(PROJECT_ROOT, 'public/data');
  const stamp = liveFolderStamp(builtAt);
  const tmp = mkdtempSync(join(tmpdir(), 'live-clouds-'));
  try {
    // Fixed inputs: on CI a cache hit leaves only a hash check per file, no download.
    const fetched = npmRun('fetch-cloud-inputs', ['--confirm']);
    if (fetched !== 0) return fetched;
    const baked = join(tmp, 'clouds.webp');
    const bake = npmRun('bake-clouds', ['--date', date, '--out', baked]);
    if (bake !== 0) return bake;
    const tiers = join(tmp, 'tiers');
    mkdirSync(tiers);
    const names: string[] = [];
    for (const tier of TIER_LADDER) {
      const name = bodyTextureFilename('earth', 'clouds', tier);
      await writeCloudTier(baked, tierToTexturePx(tier), join(tiers, name));
      await checkCloudTier(join(tiers, name), tierToTexturePx(tier));
      names.push(name);
    }
    // A copy, since the temp folder may sit on another filesystem than the repo (rename fails there).
    cpSync(tiers, join(dataRoot, liveFilePath('clouds', stamp, '')), { recursive: true });
    writeLivePointer(dataRoot, 'clouds', date, builtAt, names);
    console.log(`buildLiveClouds: ${date} → ${liveFilePath('clouds', stamp, '')}`);
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
