#!/usr/bin/env node
/**
 * fetchHorizons — pull equatorial (ICRF) positions (`vectors: 'state'` rows add velocities) over
 * each `HORIZONS_BODIES` row's span from the JPL Horizons API into
 * data/raw/horizons/<centre>/<id>.csv (`jd,x_km,y_km,z_km[,vx_kms,vy_kms,vz_kms]`), each
 * relative to its row's centre at its row's step. UT time tags, so the fit absorbs TDB−UT and
 * the app's UTC `simDays` needs no conversion. Query in the README. Ids on the command line
 * fetch only those rows. Chunking lives in `horizonsFetchPieces`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { fetchHorizonsRows } from '../utils/data/fetchHorizonsRows';
import { formatHorizonsCsv } from '../utils/data/formatHorizonsCsv';
import { horizonsCsvPath } from '../utils/io/horizonsCsvPath';
import { HORIZONS_BODIES } from '../bodies/horizonsBodies';

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const bodies = HORIZONS_BODIES.filter((b) => only.length === 0 || only.includes(b.id));
  console.log(`fetchHorizons: downloading ${bodies.length} bodies from JPL Horizons`);
  for (const body of bodies) {
    const outPath = horizonsCsvPath(body);
    mkdirSync(dirname(outPath), { recursive: true });
    const rows = await fetchHorizonsRows(body);
    writeFileSync(outPath, formatHorizonsCsv(rows, body.vectors === 'state'));
    console.log(`fetchHorizons: wrote ${outPath} (${rows.length} rows)`);
  }
}

await main();
