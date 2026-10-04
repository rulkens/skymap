#!/usr/bin/env node
/**
 * fetchHorizonsPlanets — pull 1-day heliocentric equatorial (ICRF) positions for the eight
 * planets over 1900–2100 from the JPL Horizons API into data/raw/horizons/planets/<naif>.csv
 * (`jd,x_km,y_km,z_km`, ~3 MB each). Mars–Neptune are their system barycentres and Earth is
 * the Earth–Moon barycentre: those are the points the app's Kepler rows describe. UT time tags,
 * so the fit absorbs TDB−UT and the app's UTC `simDays` needs no conversion. Query in README.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseHorizonsVectorsCsv } from '../parsers/horizonsVectorsCsv';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import type { HorizonsVectorRow } from '../parsers/@types/HorizonsVectorRow';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const TARGETS = ['199', '299', '3', '4', '5', '6', '7', '8'];
const CHUNKS: readonly [string, string][] = [
  ['1900-01-01', '1950-01-01'],
  ['1950-01-01', '2000-01-01'],
  ['2000-01-01', '2050-01-01'],
  ['2050-01-01', '2100-01-01'],
];
const MAX_ATTEMPTS = 5;

function queryUrl(naif: string, start: string, stop: string): string {
  const params: Record<string, string> = {
    format: 'json',
    COMMAND: `'${naif}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    REF_PLANE: "'FRAME'",
    TIME_TYPE: "'UT'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
    VEC_TABLE: "'1'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: "'1 d'",
  };
  return `${API}?${new URLSearchParams(params).toString()}`;
}

async function fetchChunk(naif: string, start: string, stop: string): Promise<HorizonsVectorRow[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(queryUrl(naif, start, stop));
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const body = (await response.json()) as { result?: string; error?: string };
      if (body.error || !body.result) throw new Error(body.error ?? 'empty result');
      return parseHorizonsVectorsCsv(body.result);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      console.warn(`fetchHorizonsPlanets: ${naif} ${start} attempt ${attempt} failed: ${err}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function main(): Promise<void> {
  const outDir = rawDataPath('horizons.planets');
  mkdirSync(outDir, { recursive: true });
  console.log('fetchHorizonsPlanets: downloading 8 × ~3 MB of 1-day vectors from JPL Horizons');
  for (const naif of TARGETS) {
    const chunks: HorizonsVectorRow[][] = [];
    for (const [start, stop] of CHUNKS) chunks.push(await fetchChunk(naif, start, stop));
    const rows = mergeHorizonsChunks(chunks);
    const csv = ['jd,x_km,y_km,z_km', ...rows.map((r) => `${r.jd},${r.xKm},${r.yKm},${r.zKm}`)];
    const outPath = join(outDir, `${naif}.csv`);
    writeFileSync(outPath, `${csv.join('\n')}\n`);
    console.log(`fetchHorizonsPlanets: wrote ${outPath} (${rows.length} rows)`);
  }
}

await main();
