#!/usr/bin/env node
/**
 * fetchHeightSources — pull the three Earth height sources the surface-tile
 * bake reads: ETOPO 2022 30″ globally, `skadi` 1″ over the EOX boxes, and
 * DHM/Terræn 0.4 m over Søndermarken (`--etopo`/`--skadi`/`--dhm-terraen`;
 * none means all three). Every artefact is size-checked against its format,
 * so an interrupted download is re-fetched rather than baked in truncated.
 */

import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

import { EOX_REGIONS } from './eoxRegions';
import { parseFlags } from '../utils/cli/args';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readKeychainSecret } from '../utils/io/readKeychainSecret';
import { redactSecret } from '../utils/io/redactSecret';
import { skadiCellsForBounds } from '../utils/textures/skadiCellsForBounds';
import { lonLatToUtm32 } from '../utils/geo/lonLatToUtm32';
import { earthTileBounds } from '../utils/scene/earthTileBounds';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';

/** NGDC's 30″ surface-elevation GeoTIFF; the thredds path in the spec 404s. */
const ETOPO_URL =
  'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/30s/30s_surface_elev_gtif/ETOPO_2022_v1_30s_N90W180_surface.tif';
const ETOPO_BYTES = 1_585_813_987;

const SKADI_BASE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/skadi';
/** 3601² big-endian int16 — the SRTM `.hgt` shape the reader asserts too. */
const SKADI_CELL_BYTES = 3601 * 3601 * 2;

/** Datafordeler serves the DTM as 1 km GeoTIFF tiles. The response's
 *  `content-type` claims zip and is wrong; the bytes start `II*`. */
const DHM_ENDPOINT = 'https://api.datafordeler.dk/FileDownloads/GetRasterFile';
const DHM_KEYCHAIN_SERVICE = 'skymap-datafordeler-apikey';

/**
 * The GeoDanmark albedo band's own footprint: the z19 harvest rect
 * `x[280352..280447] y[49984..50015]` (`data/raw/geodanmark/README.md`)
 * divided by 32. Heights are fetched for exactly the albedo band's boxes
 * and levels (spec §4.1), so this rect is the DHM tile set's only input.
 */
const SOENDERMARKEN_Z14 = { z: 14, xMin: 8761, xMax: 8763, y: 1562 } as const;

async function downloadToFile(
  url: string,
  destPath: string,
  transform: 'none' | 'gunzip',
): Promise<number> {
  const res = await fetch(url);
  if (!res.ok || res.body === null) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  mkdirSync(dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.tmp`;
  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  const sink = createWriteStream(tmpPath);
  await (transform === 'gunzip' ? pipeline(source, createGunzip(), sink) : pipeline(source, sink));
  const bytes = statSync(tmpPath).size;
  renameSync(tmpPath, destPath);
  return bytes;
}

/** Skip a complete file, delete and re-fetch a wrong-sized one. */
function isComplete(path: string, expectedBytes: number): boolean {
  if (!existsSync(path)) return false;
  if (statSync(path).size === expectedBytes) return true;
  process.stderr.write(`  ${path}: wrong size — deleting, re-fetching\n`);
  rmSync(path, { force: true });
  return false;
}

async function fetchEtopo(): Promise<void> {
  const destPath = rawDataPath('etopo.surface30s');
  if (isComplete(destPath, ETOPO_BYTES)) {
    process.stderr.write('etopo: already complete\n');
    return;
  }
  process.stderr.write(`etopo: downloading ${(ETOPO_BYTES / 1e9).toFixed(2)} GB\n`);
  const bytes = await downloadToFile(ETOPO_URL, destPath, 'none');
  if (bytes !== ETOPO_BYTES) {
    rmSync(destPath, { force: true });
    throw new Error(`etopo: got ${bytes} B, expected ${ETOPO_BYTES}`);
  }
}

async function fetchSkadi(): Promise<void> {
  const dir = rawDataPath('skadi.dir');
  const cells = new Set<string>();
  for (const box of Object.values(EOX_REGIONS)) {
    for (const cell of skadiCellsForBounds(box)) cells.add(cell);
  }

  let fetched = 0;
  for (const cell of [...cells].sort()) {
    const destPath = join(dir, `${cell}.hgt`);
    if (isComplete(destPath, SKADI_CELL_BYTES)) continue;
    const bytes = await downloadToFile(`${SKADI_BASE_URL}/${cell}.hgt.gz`, destPath, 'gunzip');
    if (bytes !== SKADI_CELL_BYTES) {
      rmSync(destPath, { force: true });
      throw new Error(`skadi: ${cell} gunzipped to ${bytes} B, expected ${SKADI_CELL_BYTES}`);
    }
    fetched++;
    process.stderr.write(`  ${cell}: ${(bytes / 1e6).toFixed(1)} MB\n`);
  }
  process.stderr.write(`skadi: ${cells.size} cell(s), ${fetched} newly fetched\n`);
}

/** Every 1 km DHM tile the Søndermarken z14 rect touches, by SW-corner
 *  kilometre indices in EPSG:25832 (`data/raw/dhm/README.md`'s naming). */
function dhmTiles(): string[] {
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  for (let x = SOENDERMARKEN_Z14.xMin; x <= SOENDERMARKEN_Z14.xMax; x++) {
    const box = earthTileBounds(SOENDERMARKEN_Z14.z, x, SOENDERMARKEN_Z14.y, EARTH_TILE_PX);
    west = Math.min(west, box.west);
    east = Math.max(east, box.east);
    south = Math.min(south, box.south);
    north = Math.max(north, box.north);
  }

  // All four corners, not two: the box's UTM image is a rotated quadrilateral,
  // so the easting extremes sit on different corners north and south.
  let eMin = Infinity;
  let eMax = -Infinity;
  let nMin = Infinity;
  let nMax = -Infinity;
  for (const lon of [west, east]) {
    for (const lat of [south, north]) {
      const { easting, northing } = lonLatToUtm32(lon, lat);
      eMin = Math.min(eMin, easting);
      eMax = Math.max(eMax, easting);
      nMin = Math.min(nMin, northing);
      nMax = Math.max(nMax, northing);
    }
  }

  const names: string[] = [];
  for (let n = Math.floor(nMin / 1000); n <= Math.floor(nMax / 1000); n++) {
    for (let e = Math.floor(eMin / 1000); e <= Math.floor(eMax / 1000); e++) {
      names.push(`DTM_1km_${n}_${e}`);
    }
  }
  return names;
}

async function fetchDhmTerraen(): Promise<void> {
  const dir = rawDataPath('dhmterraen.dir');
  const apiKey = readKeychainSecret(DHM_KEYCHAIN_SERVICE);
  const names = dhmTiles();
  process.stderr.write(`dhm-terraen: ${names.length} tile(s) → ${dir}\n`);

  let fetched = 0;
  for (const name of names) {
    const destPath = join(dir, `${name}.tif`);
    // No size to check against — tiles vary with terrain — so presence plus a
    // non-empty file is the completeness rule, and the bake's own read throws
    // on a truncated TIFF rather than silently returning zeros.
    if (existsSync(destPath) && statSync(destPath).size > 0) continue;
    try {
      const url = `${DHM_ENDPOINT}?FileName=${name}.tif&apiKey=${apiKey}`;
      const bytes = await downloadToFile(url, destPath, 'none');
      fetched++;
      process.stderr.write(`  ${name}: ${(bytes / 1e6).toFixed(1)} MB\n`);
    } catch (err) {
      throw new Error(redactSecret(`dhm-terraen: ${name} — ${(err as Error).message}`, apiKey));
    }
  }
  process.stderr.write(`dhm-terraen: ${names.length} tile(s), ${fetched} newly fetched\n`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = parseFlags(argv, {
    '--etopo': 'bool',
    '--skadi': 'bool',
    '--dhm-terraen': 'bool',
  });
  const all = !flags['--etopo'] && !flags['--skadi'] && !flags['--dhm-terraen'];

  if (all || flags['--etopo']) await fetchEtopo();
  if (all || flags['--skadi']) await fetchSkadi();
  if (all || flags['--dhm-terraen']) await fetchDhmTerraen();
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
