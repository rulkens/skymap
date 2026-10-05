#!/usr/bin/env node
/**
 * buildSpacecraftTracks — Voyager 1 and 2 state vectors (daily base + dense encounter windows
 * from `fetchHorizons` / `fetchVoyagerWindows`) → `public/data/spacecraftTracks.bin` plus
 * `src/data/missions/missionEvents.generated.ts`. Samples are merged, decimated so the Hermite
 * the app evaluates stays within 1 km of every raw sample, and every raw sample is re-checked
 * against the kept ones. Each encounter is first blended onto DE441 (`blendEncounterToDE441`);
 * closest approaches come straight from the craft-against-body-centre fetch. Launch,
 * boundary and milestone instants are cited literals (NASA/JPL), not derived.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import type { MissionEvent } from '../../src/@types/missions/MissionEvent';
import type { SampledTrack } from '../../src/@types/scene/SampledTrack';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { readHorizonsCsv } from '../utils/data/readHorizonsCsv';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { julianDaysToUnixMs } from '../../src/utils/time/julianDaysToUnixMs';
import { hermiteTrackAt } from '../../src/utils/orbit/hermiteTrackAt';
import { writeSpacecraftTracks } from '../utils/io/writeSpacecraftTracks';
import { closestApproach } from '../utils/math/closestApproach';
import { decimateHermiteSamples } from '../utils/math/decimateHermiteSamples';
import { HORIZONS_BODIES } from './horizonsBodies';
import { blendEncounterToDE441 } from './blendEncounterToDE441';
import { VOYAGER_ENCOUNTERS } from './voyagerEncounters';
import { VOYAGER_LAUNCHES } from './voyagerLaunches';
import { VOYAGER_MILESTONES } from './voyagerMilestones';

const TOLERANCE_KM = 1;
const RAW_ROOT = rawDataPath('horizons');
const RAW_DIR = join(RAW_ROOT, '500@10');
const TRACKS_PATH = 'public/data/spacecraftTracks.bin';
const EVENTS_PATH = 'src/data/missions/missionEvents.generated.ts';
const TITAN_RADIUS_KM = 2574.73;

const jdToIso = (jd: number): string => new Date(julianDaysToUnixMs(jd)).toISOString();

function loadDense(id: string, target: string): SampledTrack {
  const rows = mergeHorizonsChunks([
    [
      ...readHorizonsCsv(join(RAW_DIR, `${target}.csv`)),
      ...readHorizonsCsv(join(RAW_DIR, `${target}.dense.csv`)),
    ].sort((a, b) => a.jd - b.jd),
  ]);
  const track: SampledTrack = {
    id,
    tDays: new Float64Array(rows.length),
    posKm: new Float64Array(3 * rows.length),
    velKmS: new Float32Array(3 * rows.length),
  };
  rows.forEach((r, i) => {
    (track.tDays as Float64Array)[i] = r.jd;
    (track.posKm as Float64Array).set([r.xKm, r.yKm, r.zKm], 3 * i);
    (track.velKmS as Float32Array).set([r.vxKmS!, r.vyKmS!, r.vzKmS!], 3 * i);
  });
  return track;
}

function gather(dense: SampledTrack, kept: Uint32Array): SampledTrack {
  const out: SampledTrack = {
    id: dense.id,
    tDays: new Float64Array(kept.length),
    posKm: new Float64Array(3 * kept.length),
    velKmS: new Float32Array(3 * kept.length),
  };
  kept.forEach((src, k) => {
    (out.tDays as Float64Array)[k] = dense.tDays[src]!;
    (out.posKm as Float64Array).set(dense.posKm.subarray(3 * src, 3 * src + 3), 3 * k);
    (out.velKmS as Float32Array).set(dense.velKmS.subarray(3 * src, 3 * src + 3), 3 * k);
  });
  return out;
}

/** Worst distance from any raw sample to the track the app will evaluate, via its own `hermiteTrackAt`. */
function worstErrorKm(dense: SampledTrack, kept: Uint32Array): number {
  const thin = gather(dense, kept);
  let worst = 0;
  for (let i = 0; i < dense.tDays.length; i++) {
    const [x, y, z] = hermiteTrackAt(thin, dense.tDays[i]!);
    worst = Math.max(
      worst,
      Math.hypot(x - dense.posKm[3 * i]!, y - dense.posKm[3 * i + 1]!, z - dense.posKm[3 * i + 2]!),
    );
  }
  return worst;
}

/** Closest approach straight from Horizons: the craft against the body centre, 1 min. */
function flybyEvents(craft: SampledTrack, target: string): MissionEvent[] {
  return VOYAGER_ENCOUNTERS.filter((e) => e.craftId === craft.id).map((e) => {
    const rows = readHorizonsCsv(join(RAW_ROOT, `500@${e.bodyTarget}`, `${target}.csv`));
    const { jd, distanceKm } = closestApproach(rows);
    const note =
      e.bodyName === 'Titan' ? `  (surface ${(distanceKm - TITAN_RADIUS_KM).toFixed(0)} km)` : '';
    console.log(`  ${e.bodyName}: ${jdToIso(jd)}  ${distanceKm.toFixed(0)} km from centre${note}`);
    return {
      id: `${craft.id}-${e.bodyName.toLowerCase()}`,
      bodyId: craft.id,
      kind: 'flyby',
      iso: jdToIso(jd),
      label: e.bodyName,
      closestKm: Math.round(distanceKm),
    };
  });
}

/** Steps where consecutive samples disagree with trapezoid velocity integration by > 1,000 km. */
function reportJumps(track: SampledTrack): void {
  for (let i = 1; i < track.tDays.length; i++) {
    const dtS = (track.tDays[i]! - track.tDays[i - 1]!) * 86_400;
    let sum = 0;
    for (let a = 0; a < 3; a++) {
      const step = track.posKm[3 * i + a]! - track.posKm[3 * (i - 1) + a]!;
      const integrated = 0.5 * (track.velKmS[3 * i + a]! + track.velKmS[3 * (i - 1) + a]!) * dtS;
      sum += (step - integrated) ** 2;
    }
    if (Math.sqrt(sum) > 1000)
      console.log(`  jump ${jdToIso(track.tDays[i]!)}: ${Math.sqrt(sum).toFixed(0)} km`);
  }
}

async function main(): Promise<void> {
  const tracks: SampledTrack[] = [];
  const events: MissionEvent[] = [];
  for (const row of HORIZONS_BODIES.filter((b) => b.id.startsWith('voyager'))) {
    const dense = loadDense(row.id, row.target);
    const mine = VOYAGER_ENCOUNTERS.filter((e) => e.craftId === row.id);
    for (const e of mine.filter((e, i) => mine.findIndex((o) => o.date === e.date) === i)) {
      const maxKm = blendEncounterToDE441(
        dense,
        e.date,
        readHorizonsCsv(join(RAW_ROOT, `500@${e.baryTarget}`, `${row.target}.csv`)),
        readHorizonsCsv(join(RAW_DIR, `${e.baryTarget}.${e.date}.csv`)),
      );
      console.log(`${row.id} ${e.date}: blend moved the track by up to ${maxKm.toFixed(0)} km`);
    }
    reportJumps(dense);
    const kept = decimateHermiteSamples(dense.tDays, dense.posKm, dense.velKmS, TOLERANCE_KM);
    const worst = worstErrorKm(dense, kept);
    console.log(
      `${row.id}: ${dense.tDays.length} raw -> ${kept.length} samples, worst error ${worst.toFixed(3)} km`,
    );
    if (worst > TOLERANCE_KM) throw new Error(`${row.id}: reconstruction error ${worst} km`);
    tracks.push(gather(dense, kept));
    events.push(
      {
        id: `${row.id}-launch`,
        bodyId: row.id,
        kind: 'launch',
        iso: VOYAGER_LAUNCHES[row.id]!.launchIso,
        label: 'Launch',
      },
      ...flybyEvents(dense, row.target),
      ...VOYAGER_MILESTONES.filter((m) => m.craftId === row.id).map(
        ({ id, kind, iso, label }): MissionEvent => ({ id, bodyId: row.id, kind, iso, label }),
      ),
    );
  }

  events.sort((a, b) => a.iso.localeCompare(b.iso));
  const bin = writeSpacecraftTracks(tracks);
  writeFileSync(resolve(TRACKS_PATH), bin);
  console.log(`wrote ${TRACKS_PATH}: ${bin.length} bytes`);

  const source =
    '// src/data/missions/missionEvents.generated.ts\n' +
    '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
    '// Regenerate with:  npm run fetch-horizons -- voyager1 voyager2 && npm run fetch-voyager-windows && npm run build-spacecraft-tracks\n' +
    '// Source of truth:  data/raw/horizons/{500@10,500@5..500@8,500@599,500@699,500@606,500@799,500@899}/ (JPL Horizons); launch, boundary and milestone instants are cited literals\n' +
    "import type { MissionEvent } from '../../@types/missions/MissionEvent';\n\n" +
    `export const MISSION_EVENTS: readonly MissionEvent[] = ${JSON.stringify(events)};\n`;
  const outPath = resolve(EVENTS_PATH);
  writeFileSync(
    outPath,
    await format(source, { ...(await resolveConfig(outPath)), parser: 'typescript' }),
  );
  console.log(`wrote ${EVENTS_PATH}`);
}

await main();
