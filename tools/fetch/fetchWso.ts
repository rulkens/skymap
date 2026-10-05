#!/usr/bin/env node
/**
 * fetchWso — download the Wilcox Solar Observatory inputs of the heliospheric-current-sheet
 * maps: the tilt table (rotation start dates), one radial source-surface chart (R250, 2.5 Rsun)
 * per Carrington rotation, and the classic-model (S) charts the build falls back to where R250
 * has gaps. Idempotent; a failed R250 file is reported, not fatal, since some are incomplete upstream.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { rawDataPath } from '../utils/io/rawDataRegistry';

const WSO_BASE = 'http://wso.stanford.edu';
const FIRST_ROTATION = 1642;
const LAST_ROTATION = 2302;
const CLASSIC_FALLBACK_ROTATIONS = [2215, 2216, 2217];
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

type Job = { readonly url: string; readonly outPath: string };

async function download({ url, outPath }: Job): Promise<boolean> {
  if (existsSync(outPath) && statSync(outPath).size > 0) return true;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error('empty body');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, bytes);
      return true;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) console.warn(`fetchWso: ${url} failed: ${String(error)}`);
    }
  }
  return false;
}

async function runPool(jobs: readonly Job[]): Promise<Job[]> {
  const failed: Job[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      if (!(await download(job))) failed.push(job);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return failed;
}

async function main(): Promise<void> {
  const synopticDir = rawDataPath('wso.synoptic');
  const tilts: Job = { url: `${WSO_BASE}/Tilts.html`, outPath: rawDataPath('wso.tilts') };
  if (!(await download(tilts))) throw new Error('fetchWso: the tilt table is required');

  const chart = (model: 'R250' | 'S', cr: number): Job => ({
    url: `${WSO_BASE}/synoptic/WSO-${model}.${cr}.txt`,
    outPath: join(synopticDir, `WSO-${model}.${cr}.txt`),
  });
  const radial = Array.from({ length: LAST_ROTATION - FIRST_ROTATION + 1 }, (_, i) =>
    chart('R250', FIRST_ROTATION + i),
  );
  const classic = CLASSIC_FALLBACK_ROTATIONS.map((cr) => chart('S', cr));

  const failedRadial = await runPool(radial);
  const failedClassic = await runPool(classic);
  console.log(
    `fetchWso: ${radial.length - failedRadial.length}/${radial.length} R250 charts, ` +
      `${classic.length - failedClassic.length}/${classic.length} S charts in ${synopticDir}`,
  );
  if (failedClassic.length > 0) {
    throw new Error(
      `fetchWso: classic fallback charts missing: ${failedClassic.map((j) => j.url)}`,
    );
  }
}

await main();
