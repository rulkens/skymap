#!/usr/bin/env node
/**
 * fetchCelestrak — download each `CELESTRAK_GROUPS` group as OMM JSON into
 * data/raw/celestrak/<group>.json. CelesTrak serves one download per update (every 2 h) and
 * firewalls clients that fetch more, so a file younger than that is kept unless `--force`, and a
 * 403 "not updated since your last download" keeps the file already on disk. Query in the README.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { rawDataPath } from '../utils/io/rawDataRegistry';
import { CELESTRAK_GROUPS } from '../satellites/celestrakGroups';

const UPDATE_INTERVAL_MS = 2 * 3600 * 1000;
const RETRIES = 3;

const groupUrl = (group: string): string =>
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;

async function download(group: string): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(groupUrl(group));
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!Array.isArray(JSON.parse(text))) throw new Error('response is not a JSON array');
      return text;
    } catch (err) {
      if (attempt === RETRIES) throw new Error(`fetchCelestrak: ${group}: ${String(err)}`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    }
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const dir = rawDataPath('celestrak');
  mkdirSync(dir, { recursive: true });
  for (const { group } of CELESTRAK_GROUPS) {
    const path = join(dir, `${group}.json`);
    if (!force && existsSync(path) && Date.now() - statSync(path).mtimeMs < UPDATE_INTERVAL_MS) {
      console.log(`fetchCelestrak: ${group} is under 2 h old, kept`);
      continue;
    }
    const text = await download(group);
    if (text === null) {
      if (!existsSync(path)) throw new Error(`fetchCelestrak: ${group}: 403 with no local copy`);
      console.log(`fetchCelestrak: ${group} not updated upstream (403), kept`);
      continue;
    }
    writeFileSync(path, text);
    console.log(`fetchCelestrak: wrote ${path} (${(text.length / 1e6).toFixed(1)} MB)`);
  }
}

await main();
