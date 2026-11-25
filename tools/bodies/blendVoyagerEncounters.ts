/**
 * blendVoyagerEncounters — moves each of a Voyager's encounters onto DE441 in place
 * (`blendEncounterToDE441`), once per encounter date (Titan shares V1's Saturn date).
 */
import { join } from 'node:path';

import type { SampledTrack } from '../../src/@types/scene/SampledTrack';
import { readHorizonsCsv } from '../utils/data/readHorizonsCsv';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { blendEncounterToDE441 } from './blendEncounterToDE441';
import { VOYAGER_ENCOUNTERS } from './voyagerEncounters';
import type { HorizonsBody } from './@types/HorizonsBody';

export function blendVoyagerEncounters(track: SampledTrack, row: HorizonsBody): void {
  const root = rawDataPath('horizons');
  const mine = VOYAGER_ENCOUNTERS.filter((e) => e.craftId === row.id);
  for (const e of mine.filter((e, i) => mine.findIndex((o) => o.date === e.date) === i)) {
    const maxKm = blendEncounterToDE441(
      track,
      e.date,
      readHorizonsCsv(join(root, `500@${e.baryTarget}`, `${row.target}.csv`)),
      readHorizonsCsv(join(root, row.centre, `${e.baryTarget}.${e.date}.csv`)),
    );
    console.log(`${row.id} ${e.date}: blend moved the track by up to ${maxKm.toFixed(0)} km`);
  }
}
