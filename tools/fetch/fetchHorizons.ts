#!/usr/bin/env node
/**
 * fetchHorizons — pull equatorial (ICRF) positions (`vectors: 'state'` rows add velocities) over
 * each `HORIZONS_BODIES` row's span from the JPL Horizons API into
 * data/raw/horizons/<centre>/<target>.csv (`jd,x_km,y_km,z_km[,vx_kms,vy_kms,vz_kms]`), each
 * relative to its row's centre at its row's step. UT time tags, so the fit absorbs TDB−UT and
 * the app's UTC `simDays` needs no conversion. Query in the README. Ids on the command line
 * fetch only those rows. Chunking lives in `horizonsFetchPieces`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseHorizonsVectorsCsv } from '../parsers/horizonsVectorsCsv';
import { horizonsFetchPieces } from '../utils/data/horizonsFetchPieces';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { HORIZONS_BODIES } from '../bodies/horizonsBodies';
import type { HorizonsVectorRow } from '../parsers/@types/HorizonsVectorRow';
import type { HorizonsBody } from '../bodies/@types/HorizonsBody';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
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
    VEC_TABLE: body.vectors === 'state' ? "'2'" : "'1'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${body.stepMinutes} m'`,
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
  const only = process.argv.slice(2);
  const bodies = HORIZONS_BODIES.filter((b) => only.length === 0 || only.includes(b.id));
  console.log(`fetchHorizons: downloading ${bodies.length} bodies from JPL Horizons`);
  for (const body of bodies) {
    const outDir = join(rawDataPath('horizons'), body.centre);
    mkdirSync(outDir, { recursive: true });
    const chunks: HorizonsVectorRow[][] = [];
    for (const [start, stop] of horizonsFetchPieces(body.span, body.stepMinutes))
      chunks.push(await fetchChunk(body, start, stop));
    const rows = mergeHorizonsChunks(chunks);
    const state = body.vectors === 'state';
    const csv = [
      state ? 'jd,x_km,y_km,z_km,vx_kms,vy_kms,vz_kms' : 'jd,x_km,y_km,z_km',
      ...rows.map((r) =>
        (state
          ? [r.jd, r.xKm, r.yKm, r.zKm, r.vxKmS, r.vyKmS, r.vzKmS]
          : [r.jd, r.xKm, r.yKm, r.zKm]
        ).join(','),
      ),
    ];
    const outPath = join(outDir, `${body.target}.csv`);
    writeFileSync(outPath, `${csv.join('\n')}\n`);
    console.log(`fetchHorizons: wrote ${outPath} (${rows.length} rows)`);
  }
}

await main();
