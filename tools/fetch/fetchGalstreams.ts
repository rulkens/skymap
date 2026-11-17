#!/usr/bin/env node
/**
 * fetchGalstreams — pull the stream tracks of galstreams (Mateu 2023) into
 * data/raw/galstreams/: `tracks/*.ecsv` and `lib/master_log.txt` from the GitHub
 * tarball at a pinned commit. The tarball is not kept; its committed `.sha256`
 * sidecar, named by the commit, pins the bytes and marks the fetch done, so
 * bumping `GALSTREAMS_COMMIT` re-fetches on the next run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readSha256Sidecar } from '../utils/io/readSha256Sidecar';
import { downloadWithResume, sha256OfFile } from './fetchCosmicflows4';

/** `main` of github.com/cmateu/galstreams on 2026-06-03 ("install fixes"). */
const GALSTREAMS_COMMIT = '6a304c05bea7f774390a11082ea127719e99b70a';
const TARBALL_URL = `https://codeload.github.com/cmateu/galstreams/tar.gz/${GALSTREAMS_COMMIT}`;

async function main(): Promise<void> {
  const outDir = rawDataPath('galstreams.dir');
  const tarballName = `galstreams-${GALSTREAMS_COMMIT}.tar.gz`;
  const committed = readSha256Sidecar(join(outDir, tarballName));
  if (committed && existsSync(join(outDir, 'lib/master_log.txt'))) {
    console.log(`fetchGalstreams: ${outDir} already holds commit ${GALSTREAMS_COMMIT.slice(0, 7)}`);
    return;
  }

  const work = mkdtempSync(join(tmpdir(), 'galstreams-'));
  try {
    const tarball = join(work, tarballName);
    console.log(`fetchGalstreams: GET ${TARBALL_URL}`);
    await downloadWithResume(TARBALL_URL, tarball);
    const digest = await sha256OfFile(tarball);
    if (committed && committed !== digest) {
      throw new Error(`fetchGalstreams: tarball sha256 ${digest} ≠ committed ${committed}`);
    }
    // The tarball nests everything under galstreams-<commit>/galstreams/.
    const root = `galstreams-${GALSTREAMS_COMMIT}/galstreams`;
    mkdirSync(outDir, { recursive: true });
    const tar = spawnSync('tar', [
      '-xzf',
      tarball,
      '-C',
      outDir,
      '--strip-components=2',
      `${root}/tracks`,
      `${root}/lib/master_log.txt`,
    ]);
    if (tar.status !== 0) throw new Error(`fetchGalstreams: tar failed: ${tar.stderr.toString()}`);
    writeFileSync(join(outDir, `${tarballName}.sha256`), `${digest}  ${tarballName}\n`);
    console.log(`fetchGalstreams: extracted tracks + master log into ${outDir} (sha256 ${digest})`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
