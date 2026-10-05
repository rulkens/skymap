#!/usr/bin/env node
/**
 * fetchVoyagerWindows — the extra Horizons data `buildSpacecraftTracks` needs beside the daily
 * `voyager1`/`voyager2` rows of `fetchHorizons`. The Sun-chain craft vectors (`-31` against
 * 500@10) follow the craft file's own planet chain, which is hundreds to thousands of km from the
 * DE441 planets the app draws, so each encounter also gets the craft against its system
 * barycentre and that barycentre against the Sun. Everything is 1 min within ±2 d, plus 1 h
 * out to ±60 d (Sun chain) or ±120 d (the DE441 pair). Files, all under data/raw/horizons/:
 *   500@10/<craft>.dense.csv        Sun-chain state, windows + the first sample after launch
 *   500@<bary>/<craft>.csv          craft vs system barycentre, state
 *   500@10/<bary>.<date>.csv        barycentre vs Sun (DE441), state
 *   500@<body>/<craft>.csv          craft vs flown-by body centre, position, 1 min ±2 d
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fetchHorizonsRows } from '../utils/data/fetchHorizonsRows';
import { formatHorizonsCsv } from '../utils/data/formatHorizonsCsv';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { HORIZONS_BODIES } from '../bodies/horizonsBodies';
import { VOYAGER_ENCOUNTERS } from '../bodies/voyagerEncounters';
import { VOYAGER_LAUNCHES } from '../bodies/voyagerLaunches';
import type { HorizonsBody } from '../bodies/@types/HorizonsBody';
import type { HorizonsVectorRow } from '../parsers/@types/HorizonsVectorRow';

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

/** 1 h out to ±hourlyDays and 1 min within ±2 d of `date`, merged in time order. */
async function encounterRows(
  base: HorizonsBody,
  dates: readonly string[],
  hourlyDays: number,
): Promise<HorizonsVectorRow[]> {
  const rows: HorizonsVectorRow[] = [];
  for (const date of dates) {
    rows.push(...(await fetchHorizonsRows(window(base, date, hourlyDays, 60))));
    rows.push(...(await fetchHorizonsRows(window(base, date, 2, 1))));
  }
  return mergeHorizonsChunks([rows.sort((a, b) => a.jd - b.jd)]);
}

function write(centre: string, name: string, rows: HorizonsVectorRow[], state: boolean): void {
  const dir = join(rawDataPath('horizons'), centre);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), formatHorizonsCsv(rows, state));
  console.log(`fetchVoyagerWindows: ${centre}/${name} ${rows.length} rows`);
}

async function main(): Promise<void> {
  const crafts = HORIZONS_BODIES.filter((b) => b.id.startsWith('voyager'));
  for (const craft of crafts) {
    const mine = VOYAGER_ENCOUNTERS.filter((e) => e.craftId === craft.id);
    const dates = [...new Set(mine.map((e) => e.date))];

    const { firstSample } = VOYAGER_LAUNCHES[craft.id]!;
    const launch = await fetchHorizonsRows({
      ...craft,
      span: [firstSample, dayOffset(firstSample.slice(0, 10), 1)],
    });
    const sun = await encounterRows(craft, dates, 60);
    write('500@10', `${craft.target}.dense.csv`, mergeHorizonsChunks([launch, sun]), true);

    for (const e of mine.filter((e, i) => mine.findIndex((o) => o.date === e.date) === i)) {
      const rel = { ...craft, centre: `500@${e.baryTarget}` };
      write(rel.centre, `${craft.target}.csv`, await encounterRows(rel, [e.date], 120), true);
    }
    for (const e of mine) {
      const body: HorizonsBody = { ...craft, centre: `500@${e.bodyTarget}`, vectors: 'position' };
      const rows = await fetchHorizonsRows(window(body, e.date, 2, 1));
      write(body.centre, `${craft.target}.csv`, rows, false);
    }
  }

  const bary = new Set(VOYAGER_ENCOUNTERS.map((e) => `${e.baryTarget} ${e.date}`));
  for (const key of bary) {
    const [target, date] = key.split(' ') as [string, string];
    const body: HorizonsBody = {
      id: `bary${target}`,
      target,
      centre: '500@10',
      span: ['', ''],
      stepMinutes: 60,
      vectors: 'state',
    };
    write('500@10', `${target}.${date}.csv`, await encounterRows(body, [date], 120), true);
  }
}

await main();
