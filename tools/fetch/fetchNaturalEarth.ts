#!/usr/bin/env node
/**
 * fetchNaturalEarth — download the Natural Earth GeoJSON layers the antique
 * Earth map bakes from into data/raw/naturalearth/. Read from the
 * nvkelso/natural-earth-vector repository at a pinned commit (release v5.1.2)
 * rather than naturalearthdata.com's shapefile zips: GeoJSON needs no parser,
 * and a commit pin makes the bytes, and so the committed checksums, fixed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import { rawDataPath, type RawDataKey } from '../utils/io/rawDataRegistry';

/** natural-earth-vector tag v5.1.2. */
const COMMIT = 'f1890d9f152c896d250a77557a5751a93d494776';
const BASE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${COMMIT}/geojson`;
const LAYERS: readonly RawDataKey[] = [
  'naturalearth.rivers-lake-centerlines',
  'naturalearth.rivers-europe',
  'naturalearth.admin-1',
];

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function main(): Promise<void> {
  const sidecarPath = rawDataPath('naturalearth.sha256');
  const expected = new Map(
    (existsSync(sidecarPath) ? readFileSync(sidecarPath, 'utf8') : '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hex, name] = line.split(/\s+/);
        return [name!, hex!] as const;
      }),
  );
  for (const key of LAYERS) {
    const path = rawDataPath(key);
    const name = basename(path);
    if (existsSync(path) && sha256(readFileSync(path)) === expected.get(name)) {
      console.log(`fetchNaturalEarth: ${name} matches its checksum, skipped`);
      continue;
    }
    const url = `${BASE_URL}/${name}`;
    console.log(`fetchNaturalEarth: GET ${url}`);
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`fetchNaturalEarth: ${response.status} ${response.statusText} for ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = sha256(bytes);
    // The URL is pinned to a commit, so a different digest is a broken transfer, never a new release.
    if (expected.has(name) && expected.get(name) !== digest) {
      throw new Error(
        `fetchNaturalEarth: ${name} sha256 ${digest}, expected ${expected.get(name)}`,
      );
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    expected.set(name, digest);
    console.log(`fetchNaturalEarth: wrote ${path} (${(bytes.length / 1e6).toFixed(1)} MB)`);
  }
  writeFileSync(sidecarPath, [...expected].map(([name, hex]) => `${hex}  ${name}\n`).join(''));
}

await main();
