#!/usr/bin/env node
/**
 * fetchVasiliev2021 — pull the present-day Sagittarius snapshot of Vasiliev,
 * Belokurov & Erkal 2021 (Zenodo 4300977) into data/raw/vasiliev2021/. The
 * 43.6 MB zip holds two snapshots, observations and potentials; only the
 * with-LMC `Sgr_snapshot/` star particles and their readme are kept. The
 * `.sha256` sidecars are committed: a re-run whose files match them is a no-op,
 * and an extract that disagrees with them fails rather than overwriting.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readSha256Sidecar } from '../utils/io/readSha256Sidecar';
import { sha256OfFile } from './fetchCosmicflows4';

const ZIP_URL = 'https://zenodo.org/records/4300977/files/Sgr_stream_simulations.zip?download=1';

/** Zip member → registry destination. */
const MEMBERS: readonly (readonly [string, string])[] = [
  ['Sgr_snapshot/stars.txt', rawDataPath('vasiliev2021.stars')],
  ['Sgr_snapshot/readme.txt', rawDataPath('vasiliev2021.readme')],
];

async function matchesSidecar(path: string): Promise<boolean> {
  const expected = readSha256Sidecar(path);
  return expected !== null && existsSync(path) && (await sha256OfFile(path)) === expected;
}

async function main(): Promise<void> {
  const present = await Promise.all(MEMBERS.map(([, dest]) => matchesSidecar(dest)));
  if (present.every(Boolean)) {
    console.log('fetchVasiliev2021: files match their .sha256 sidecars — nothing to do');
    return;
  }

  const work = mkdtempSync(join(tmpdir(), 'vasiliev2021-'));
  try {
    const zipPath = join(work, 'Sgr_stream_simulations.zip');
    console.log(`fetchVasiliev2021: GET ${ZIP_URL}`);
    // Zenodo answers Node's default `User-Agent: node` with a 403.
    const response = await fetch(ZIP_URL, { headers: { 'User-Agent': 'skymap-fetch' } });
    if (!response.ok) {
      throw new Error(`fetchVasiliev2021: ${response.status} ${response.statusText}`);
    }
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    const unzip = spawnSync('unzip', ['-o', '-q', zipPath, ...MEMBERS.map(([m]) => m), '-d', work]);
    if (unzip.status !== 0) {
      throw new Error(`fetchVasiliev2021: unzip failed: ${unzip.stderr.toString()}`);
    }
    for (const [member, dest] of MEMBERS) {
      const extracted = join(work, member);
      const digest = await sha256OfFile(extracted);
      const expected = readSha256Sidecar(dest);
      if (expected !== null && expected !== digest) {
        throw new Error(
          `fetchVasiliev2021: ${member} sha256 ${digest} ≠ committed ${expected} — upstream changed?`,
        );
      }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(extracted));
      writeFileSync(`${dest}.sha256`, `${digest}  ${basename(dest)}\n`);
      console.log(`fetchVasiliev2021: wrote ${dest} (sha256 ${digest})`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
