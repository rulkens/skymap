#!/usr/bin/env node
/**
 * `npm run build-live-clouds` — the clouds row of the live datasets (src/data/live/liveDatasets.ts):
 * bakes yesterday (UTC), writes the three grey tiers under a dated live folder, checks each, and only
 * then moves the pointer. A failing step exits non-zero with the pointer untouched; the bake's own
 * exit code passes through, so 3 (retry later) stays distinguishable from 2 and 4 (page a human).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { TIER_LADDER } from '../../src/data/tierLadder';
import { bodyTextureFilename } from '../../src/utils/bodyTextures/bodyTextureFilename';
import { liveFilePath } from '../../src/utils/live/liveFilePath';
import { liveFolderStamp } from '../../src/utils/live/liveFolderStamp';
import { tierToTexturePx } from '../../src/utils/math/tierToTexturePx';
import { writeCloudTier } from '../textures/writeCloudTier';
import { PROJECT_ROOT } from '../utils/io/projectRoot';
import { writeLivePointer } from '../utils/live/writeLivePointer';
import { checkCloudTier } from './checkCloudTier';

const MS_PER_DAY = 86_400_000;

function npmRun(script: string, args: readonly string[]): number {
  return spawnSync('npm', ['run', '-s', script, '--', ...args], { stdio: 'inherit' }).status ?? 1;
}

/** Resolves to the process exit code. */
async function main(): Promise<number> {
  const builtAt = new Date();
  const date = new Date(builtAt.getTime() - MS_PER_DAY).toISOString().slice(0, 10);
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
    const names: string[] = [];
    for (const tier of TIER_LADDER) {
      const name = bodyTextureFilename('earth', 'clouds', tier);
      const out = join(dataRoot, liveFilePath('clouds', stamp, name));
      mkdirSync(dirname(out), { recursive: true });
      await writeCloudTier(baked, tierToTexturePx(tier), out);
      await checkCloudTier(out, tierToTexturePx(tier));
      names.push(name);
    }
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
