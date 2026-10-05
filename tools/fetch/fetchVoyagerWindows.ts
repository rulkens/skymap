#!/usr/bin/env node
/**
 * fetchVoyagerWindows — the dense Horizons data around each Voyager encounter, beside the daily
 * `voyager1`/`voyager2` rows of `fetchHorizons`. Per craft: `500@10/<target>.dense.csv`, state
 * vectors at 1 h within ±60 d and 1 min within ±2 d of each encounter date, merged. Per
 * flown-by body: `500@10/<body>.<date>.csv`, centre position at 1 min within ±2 d — what the
 * closest approach is measured against. `buildSpacecraftTracks` merges and decimates.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fetchHorizonsRows } from '../utils/data/fetchHorizonsRows';
import { formatHorizonsCsv } from '../utils/data/formatHorizonsCsv';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { HORIZONS_BODIES } from '../bodies/horizonsBodies';
import { VOYAGER_ENCOUNTERS } from '../bodies/voyagerEncounters';
import type { HorizonsBody } from '../bodies/@types/HorizonsBody';

const CENTRE = '500@10';
const MS_PER_DAY = 86_400_000;

const dayOffset = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);

const window = (
  base: HorizonsBody,
  date: string,
  halfDays: number,
  step: number,
): HorizonsBody => ({
  ...base,
  span: [dayOffset(date, -halfDays), dayOffset(date, halfDays)],
  stepMinutes: step,
});

async function main(): Promise<void> {
  const outDir = join(rawDataPath('horizons'), CENTRE);
  mkdirSync(outDir, { recursive: true });
  const crafts = HORIZONS_BODIES.filter((b) => b.id.startsWith('voyager'));
  for (const craft of crafts) {
    const dates = [
      ...new Set(VOYAGER_ENCOUNTERS.filter((e) => e.craftId === craft.id).map((e) => e.date)),
    ];
    const chunks = [];
    for (const date of dates) {
      chunks.push(await fetchHorizonsRows(window(craft, date, 60, 60)));
      chunks.push(await fetchHorizonsRows(window(craft, date, 2, 1)));
    }
    // The 1 h and 1 min windows overlap and interleave; merging needs time order.
    const rows = mergeHorizonsChunks([chunks.flat().sort((a, b) => a.jd - b.jd)]);
    writeFileSync(join(outDir, `${craft.target}.dense.csv`), formatHorizonsCsv(rows, true));
    console.log(`fetchVoyagerWindows: ${craft.id} ${rows.length} dense rows`);
  }
  for (const e of VOYAGER_ENCOUNTERS) {
    const body: HorizonsBody = {
      id: e.bodyName.toLowerCase(),
      target: e.bodyTarget,
      centre: CENTRE,
      span: ['', ''],
      stepMinutes: 1,
      vectors: 'position',
    };
    const rows = await fetchHorizonsRows(window(body, e.date, 2, 1));
    writeFileSync(join(outDir, `${e.bodyTarget}.${e.date}.csv`), formatHorizonsCsv(rows, false));
    console.log(`fetchVoyagerWindows: ${e.bodyName} ${e.date} ${rows.length} rows`);
  }
}

await main();
