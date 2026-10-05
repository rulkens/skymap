#!/usr/bin/env node
/**
 * buildSpacecraftTracks — Voyager 1 and 2 state vectors (daily base + dense encounter windows
 * from `fetchHorizons` / `fetchVoyagerWindows`) → `public/data/spacecraftTracks.bin` plus
 * `src/data/missions/missionEvents.generated.ts`. Samples are merged, decimated so the Hermite
 * the app evaluates stays within 1 km of every raw sample, and every raw sample is re-checked
 * against the kept ones. Closest approaches are measured against the body-centre vectors.
 * Heliopause dates are cited literals (NASA/JPL announcements), not derived.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import type { MissionEvent } from '../../src/@types/missions/MissionEvent';
import type { SampledTrack } from '../../src/@types/scene/SampledTrack';
import { mergeHorizonsChunks } from '../utils/data/mergeHorizonsChunks';
import { readHorizonsCsv } from '../utils/data/readHorizonsCsv';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { writeSpacecraftTracks } from '../utils/io/writeSpacecraftTracks';
import { closestApproach } from '../utils/math/closestApproach';
import { decimateHermiteSamples } from '../utils/math/decimateHermiteSamples';
import { hermitePositionKm } from '../utils/math/hermitePositionKm';
import { HORIZONS_BODIES } from './horizonsBodies';
import { VOYAGER_ENCOUNTERS } from './voyagerEncounters';

const TOLERANCE_KM = 1;
const RAW_DIR = join(rawDataPath('horizons'), '500@10');
const TRACKS_PATH = 'public/data/spacecraftTracks.bin';
const EVENTS_PATH = 'src/data/missions/missionEvents.generated.ts';
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86_400_000;
const TITAN_RADIUS_KM = 2574.73;

const HELIOPAUSE: Readonly<Record<string, string>> = {
  voyager1: '2012-08-25T00:00:00.000Z',
  voyager2: '2018-11-05T00:00:00.000Z',
};

const jdToIso = (jd: number): string => new Date((jd - UNIX_EPOCH_JD) * MS_PER_DAY).toISOString();

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

/** Worst distance from any raw sample to the Hermite through the kept ones, as the app evaluates it. */
function worstErrorKm(dense: SampledTrack, kept: Uint32Array): number {
  const thin = gather(dense, kept);
  let worst = 0;
  for (let seg = 0; seg < kept.length - 1; seg++) {
    for (let i = kept[seg]! + 1; i < kept[seg + 1]!; i++) {
      const [x, y, z] = hermitePositionKm(
        thin.tDays,
        thin.posKm,
        thin.velKmS,
        seg,
        seg + 1,
        dense.tDays[i]!,
      );
      worst = Math.max(
        worst,
        Math.hypot(
          x - dense.posKm[3 * i]!,
          y - dense.posKm[3 * i + 1]!,
          z - dense.posKm[3 * i + 2]!,
        ),
      );
    }
  }
  return worst;
}

function flybyEvents(craft: SampledTrack): MissionEvent[] {
  return VOYAGER_ENCOUNTERS.filter((e) => e.craftId === craft.id).map((e) => {
    const rows = readHorizonsCsv(join(RAW_DIR, `${e.bodyTarget}.${e.date}.csv`));
    const target = {
      t: Float64Array.from(rows, (r) => r.jd),
      pos: Float64Array.from(rows.flatMap((r) => [r.xKm, r.yKm, r.zKm])),
    };
    const { jd, distanceKm } = closestApproach({ t: craft.tDays, pos: craft.posKm }, target);
    const note =
      e.bodyName === 'Titan' ? `  (surface ${(distanceKm - TITAN_RADIUS_KM).toFixed(0)} km)` : '';
    console.log(`  ${e.bodyName}: ${jdToIso(jd)}  ${distanceKm.toFixed(0)} km from centre${note}`);
    return {
      bodyId: craft.id,
      kind: 'flyby',
      iso: jdToIso(jd),
      label: `${e.bodyName} closest approach`,
    };
  });
}

async function main(): Promise<void> {
  const tracks: SampledTrack[] = [];
  const events: MissionEvent[] = [];
  for (const row of HORIZONS_BODIES.filter((b) => b.id.startsWith('voyager'))) {
    const dense = loadDense(row.id, row.target);
    const kept = decimateHermiteSamples(dense.tDays, dense.posKm, dense.velKmS, TOLERANCE_KM);
    const worst = worstErrorKm(dense, kept);
    console.log(
      `${row.id}: ${dense.tDays.length} raw -> ${kept.length} samples, worst error ${worst.toFixed(3)} km`,
    );
    if (worst > TOLERANCE_KM) throw new Error(`${row.id}: reconstruction error ${worst} km`);
    tracks.push(gather(dense, kept));
    events.push(
      { bodyId: row.id, kind: 'launch', iso: jdToIso(dense.tDays[0]!), label: 'Launch' },
      ...flybyEvents(dense),
      {
        bodyId: row.id,
        kind: 'heliopause',
        iso: HELIOPAUSE[row.id]!,
        label: 'Heliopause crossing',
      },
    );
  }

  const bin = writeSpacecraftTracks(tracks);
  writeFileSync(resolve(TRACKS_PATH), bin);
  console.log(`wrote ${TRACKS_PATH}: ${bin.length} bytes`);

  const source =
    '// src/data/missions/missionEvents.generated.ts\n' +
    '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
    '// Regenerate with:  npm run fetch-horizons -- voyager1 voyager2 && npm run fetch-voyager-windows && npm run build-spacecraft-tracks\n' +
    '// Source of truth:  data/raw/horizons/500@10/ (JPL Horizons); heliopause dates are cited literals\n' +
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
