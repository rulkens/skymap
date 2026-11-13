#!/usr/bin/env node
/**
 * buildAsteroids — data/raw/mpcorb/MPCORB.DAT.gz → public/data/asteroids/: `asteroids.astb` (every
 * numbered minor planet, quantized), `asteroid-names.bin` and `mpcorb-header.txt`. MPC's terms allow
 * redistribution only with the file's header and where to get updates, so the header ships beside the
 * data. The `.gz` is read as a stream (321 MB unpacked). Rows off the dominant epoch are moved onto it.
 * Rows with no class (orbit type 10, beyond this Layer) ship as ABSENT rows, and without their names.
 */
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

import type { MpcorbRow } from '../@types/asteroids/MpcorbRow';
import { ASTEROID_CATALOG_PATHS } from '../../src/data/asteroids/asteroidCatalogPaths';
import { PROJECT_ROOT } from '../utils/io/projectRoot';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { writeAsteroidCatalog } from '../utils/io/writeAsteroidCatalog';
import { writeAsteroidNames } from '../utils/io/writeAsteroidNames';
import { parseMpcorbLine } from './parseMpcorbLine';
import { propagateToEpoch } from './propagateToEpoch';

const UPDATES_URL = 'https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT';

async function readNumberedSection(path: string): Promise<{ header: string[]; rows: MpcorbRow[] }> {
  const header: string[] = [];
  const rows: MpcorbRow[] = [];
  let inHeader = true;
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of lines) {
    if (inHeader) {
      header.push(line);
      inHeader = !line.startsWith('-----');
      continue;
    }
    // The numbered section ends at the first blank line; the unnumbered ones follow.
    if (line.trim() === '') break;
    rows.push(parseMpcorbLine(line));
  }
  lines.close();
  if (inHeader) throw new Error(`buildAsteroids: no "-----" header rule in ${path}`);
  return { header, rows };
}

function dominantEpoch(rows: readonly MpcorbRow[]): {
  epochJd: number;
  counts: Map<number, number>;
} {
  const counts = new Map<number, number>();
  for (const { epochJd } of rows) counts.set(epochJd, (counts.get(epochJd) ?? 0) + 1);
  const [epochJd] = [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return { epochJd, counts };
}

function write(relPath: string, bytes: Uint8Array | string): string {
  const out = join(PROJECT_ROOT, 'public/data', relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  return out;
}

async function main(): Promise<void> {
  const { header, rows } = await readNumberedSection(rawDataPath('mpcorb'));
  const { epochJd, counts } = dominantEpoch(rows);
  const atEpoch = rows.map((row) => propagateToEpoch(row, epochJd));
  const { bytes, gaps, defaultedG } = writeAsteroidCatalog(atEpoch, epochJd);
  const named = rows.flatMap(({ number, name, asteroidClass }) =>
    name === null || asteroidClass === null ? [] : [{ number, name }],
  );
  const names = writeAsteroidNames(named);
  const catalogOut = write(ASTEROID_CATALOG_PATHS.catalog, bytes);
  const namesOut = write(ASTEROID_CATALOG_PATHS.names, names);
  write(
    ASTEROID_CATALOG_PATHS.header,
    [
      ...header,
      '',
      'skymap ships orbital elements derived from this file: numbered objects only, quantized, and',
      `propagated to the shared epoch JD ${epochJd} TT. Updated copies: ${UPDATES_URL}`,
      '',
    ].join('\n'),
  );

  const epochs = [...counts].map(([jd, count]) => `JD ${jd} × ${count}`).join(', ');
  console.log(`buildAsteroids: ${rows.length} numbered rows read; epochs ${epochs}`);
  console.log(`buildAsteroids: ${gaps.length} gaps${gaps.length ? ` (${gaps.join(', ')})` : ''}`);
  console.log(
    `buildAsteroids: ${rows.filter((r) => r.orbitType === 0).length} rows with orbit type 0, counted main belt`,
  );
  console.log(
    `buildAsteroids: ${rows.filter((r) => r.asteroidClass === null).length} rows with orbit type 10 written ABSENT`,
  );
  if (defaultedG.length)
    console.log(`buildAsteroids: G out of range, default used: ${defaultedG.join(', ')}`);
  console.log(
    `buildAsteroids: ${bytes.length / 1e6} MB, ${rows.length + gaps.length} rows → ${catalogOut}`,
  );
  console.log(`buildAsteroids: ${names.length / 1e6} MB, ${named.length} names → ${namesOut}`);
}

await main();
