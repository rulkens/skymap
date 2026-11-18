#!/usr/bin/env node
/**
 * fetchSbdbDiameters — every numbered asteroid with a measured diameter (~135k rows, mostly NEOWISE)
 * from the JPL SBDB Query API into data/raw/sbdb/diameters.json, with a `.sha256` sidecar. The gateway
 * answers the whole query with a 502, so it is paged in SPK-id order and the pages joined into one
 * response-shaped file. JPL's fair-use policy asks for one request at a time, backing off on errors, no
 * redundant re-fetches and a User-Agent with contact details: a file matching its sidecar is kept
 * unless `--force`. The joined rows must number the first page's `count`, or a short answer would pass.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { SbdbQueryAnswer } from '../@types/asteroids/SbdbQueryAnswer';
import { RAW_DATA, rawDataPath } from '../utils/io/rawDataRegistry';
import { readSha256Sidecar } from '../utils/io/readSha256Sidecar';
import { sha256OfFile } from './fetchCosmicflows4';

const USER_AGENT = 'skymap-fetch/1.0 (https://github.com/rulkens/skymap; rulkens@gmail.com)';
const QUERY = {
  'sb-kind': 'a',
  'sb-ns': 'n',
  'sb-cdata': '{"AND":["diameter|DF"]}',
  fields: 'pdes,diameter,albedo,diameter_sigma',
  sort: 'spkid',
};
const PAGE_ROWS = 50_000;
const TRIES = 5;
const BACKOFF_MS = 5_000;


async function fetchPage(from: number): Promise<SbdbQueryAnswer> {
  const params = new URLSearchParams({
    ...QUERY,
    limit: String(PAGE_ROWS),
    'limit-from': String(from),
  });
  const url = `${RAW_DATA['sbdb.diameters'].upstream}?${params}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) return (await res.json()) as SbdbQueryAnswer;
    if (attempt === TRIES) throw new Error(`fetchSbdbDiameters: HTTP ${res.status} (${url})`);
    console.log(`fetchSbdbDiameters: HTTP ${res.status} at row ${from}, retry ${attempt}`);
    await sleep(BACKOFF_MS * attempt);
  }
}

async function main(): Promise<void> {
  const path = rawDataPath('sbdb.diameters');
  const pinned = readSha256Sidecar(path);
  if (
    !process.argv.includes('--force') &&
    existsSync(path) &&
    pinned === (await sha256OfFile(path))
  ) {
    console.log(
      `fetchSbdbDiameters: ${path} matches its .sha256 sidecar, kept (--force refetches)`,
    );
    return;
  }
  const first = await fetchPage(0);
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await fetchPage(data.length);
    if (page.data.length === 0) break;
    data.push(...page.data);
  }
  if (data.length !== first.count) {
    throw new Error(
      `fetchSbdbDiameters: ${data.length} rows of ${first.count} — answer changed or cut short`,
    );
  }
  const text = JSON.stringify({ ...first, data });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.part`, text);
  renameSync(`${path}.part`, path);
  const digest = await sha256OfFile(path);
  writeFileSync(`${path}.sha256`, `${digest}  ${basename(path)}\n`);
  const changed = pinned !== null && pinned !== digest ? ' (differs from the last copy)' : '';
  console.log(
    `fetchSbdbDiameters: wrote ${path}: ${data.length} rows, ${(text.length / 1e6).toFixed(1)} MB, sha256 ${digest}${changed}`,
  );
}

await main();
