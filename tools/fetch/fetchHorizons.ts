#!/usr/bin/env node
/**
 * fetchHorizons — pull equatorial (ICRF) positions over 1900–2100 for every `HORIZONS_BODIES` row
 * from the JPL Horizons API into data/raw/horizons/<centre>/<target>.csv (`jd,x_km,y_km,z_km`),
 * each relative to its row's centre at its row's step. UT time tags, so the fit absorbs TDB−UT
 * and the app's UTC `simDays` needs no conversion. Query in the README.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseHorizonsVectorsCsv } from '../parsers/horizonsVectorsCsv';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { HORIZONS_BODIES } from '../bodies/horizonsBodies';
import type { HorizonsVectorRow } from '../parsers/@types/HorizonsVectorRow';
import type { HorizonsBody } from '../bodies/@types/HorizonsBody';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const CHUNKS: readonly [string, string][] = [
  ['1900-01-01', '1950-01-01'],
  ['1950-01-01', '2000-01-01'],
  ['2000-01-01', '2050-01-01'],
  ['2050-01-01', '2100-01-01'],
];
const MAX_ATTEMPTS = 5;

function queryUrl(body: HorizonsBody, start: string, stop: string): string {
  const params: Record<string, string> = {
    format: 'json',
    COMMAND: `'${body.target}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${body.centre}'`,
    REF_PLANE: "'FRAME'",
    TIME_TYPE: "'UT'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
    VEC_TABLE: "'1'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${body.stepDays} d'`,
  };
  return `${API}?${new URLSearchParams(params).toString()}`;
}

async function fetchChunk(
  body: HorizonsBody,
  start: string,
  stop: string,
): Promise<HorizonsVectorRow[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(queryUrl(body, start, stop));
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const json = (await response.json()) as { result?: string; error?: string };
      if (json.error || !json.result) throw new Error(json.error ?? 'empty result');
      return parseHorizonsVectorsCsv(json.result);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      console.warn(`fetchHorizons: ${body.id} ${start} attempt ${attempt} failed: ${err}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function main(): Promise<void> {
  console.log(`fetchHorizons: downloading ${HORIZONS_BODIES.length} bodies from JPL Horizons`);
  for (const body of HORIZONS_BODIES) {
    const outDir = join(rawDataPath('horizons'), body.centre);
    mkdirSync(outDir, { recursive: true });
    const chunks: HorizonsVectorRow[][] = [];
    for (const [start, stop] of CHUNKS) chunks.push(await fetchChunk(body, start, stop));
    const rows = mergeHorizonsChunks(chunks);
    const csv = ['jd,x_km,y_km,z_km', ...rows.map((r) => `${r.jd},${r.xKm},${r.yKm},${r.zKm}`)];
    const outPath = join(outDir, `${body.target}.csv`);
    writeFileSync(outPath, `${csv.join('\n')}\n`);
    console.log(`fetchHorizons: wrote ${outPath} (${rows.length} rows)`);
  }
}

await main();
