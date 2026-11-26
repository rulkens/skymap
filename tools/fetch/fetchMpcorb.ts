#!/usr/bin/env node
/**
 * fetchMpcorb — download MPCORB.DAT.gz (~94 MB, every minor-planet orbit the MPC publishes) into
 * data/raw/mpcorb/. The MPC rewrites it daily, so a copy under a day old is kept unless `--force`.
 * It downloads to a `.part` file first: a dropped connection leaves the last good copy in place,
 * and resuming by byte range would splice two days' files. The bake reads the `.gz` as a stream.
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { RAW_DATA, rawDataPath } from '../utils/io/rawDataRegistry';

const UPDATE_INTERVAL_MS = 24 * 3600 * 1000;

async function main(): Promise<void> {
  const path = rawDataPath('mpcorb');
  if (
    !process.argv.includes('--force') &&
    existsSync(path) &&
    Date.now() - statSync(path).mtimeMs < UPDATE_INTERVAL_MS
  ) {
    console.log(`fetchMpcorb: ${path} is under a day old, kept`);
    return;
  }
  const url = RAW_DATA.mpcorb.upstream;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`fetchMpcorb: HTTP ${res.status} (${url})`);
  mkdirSync(dirname(path), { recursive: true });
  const part = `${path}.part`;
  // `res.body` is a WHATWG stream; Node's `fromWeb` typing wants its own flavour of the same object.
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(part));
  renameSync(part, path);
  console.log(`fetchMpcorb: wrote ${path} (${(statSync(path).size / 1e6).toFixed(1)} MB)`);
}

await main();
