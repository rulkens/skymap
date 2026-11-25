#!/usr/bin/env node
/**
 * buildMissionEvents — the Voyagers' launches, flybys and milestones →
 * `src/layers/missions/events/data/missionEvents.generated.ts`, sorted by instant. Closest
 * approaches come straight from the craft-against-body-centre fetch (`fetchVoyagerWindows`);
 * launch, boundary and milestone instants are cited literals (NASA/JPL), not derived.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import type { MissionEvent } from '../../src/@types/exhibits/timeline/MissionEvent';
import { readHorizonsCsv } from '../utils/data/readHorizonsCsv';
import { horizonsCsvPath } from '../utils/io/horizonsCsvPath';
import { julianDaysToUnixMs } from '../../src/utils/time/julianDaysToUnixMs';
import { closestApproach } from '../utils/math/closestApproach';
import { HORIZONS_BODIES } from '../bodies/horizonsBodies';
import { VOYAGER_ENCOUNTERS } from '../bodies/voyagerEncounters';
import { VOYAGER_LAUNCHES } from '../bodies/voyagerLaunches';
import { VOYAGER_MILESTONES } from '../bodies/voyagerMilestones';

const EVENTS_PATH = 'src/layers/missions/events/data/missionEvents.generated.ts';
const TITAN_RADIUS_KM = 2574.73;

const jdToIso = (jd: number): string => new Date(julianDaysToUnixMs(jd)).toISOString();

function flybyEvents(craftId: string): MissionEvent[] {
  return VOYAGER_ENCOUNTERS.filter((e) => e.craftId === craftId).map((e) => {
    const rows = readHorizonsCsv(horizonsCsvPath({ id: craftId, centre: `500@${e.bodyTarget}` }));
    const { jd, distanceKm } = closestApproach(rows);
    const note =
      e.bodyName === 'Titan' ? `  (surface ${(distanceKm - TITAN_RADIUS_KM).toFixed(0)} km)` : '';
    console.log(`  ${e.bodyName}: ${jdToIso(jd)}  ${distanceKm.toFixed(0)} km from centre${note}`);
    return {
      id: `${craftId}-${e.bodyName.toLowerCase()}`,
      bodyId: craftId,
      kind: 'flyby',
      iso: jdToIso(jd),
      label: e.bodyName,
      closestKm: Math.round(distanceKm),
      targetId: e.bodyName.toLowerCase(),
    };
  });
}

const events: MissionEvent[] = HORIZONS_BODIES.filter((b) => b.id in VOYAGER_LAUNCHES).flatMap(
  (row): MissionEvent[] => [
    {
      id: `${row.id}-launch`,
      bodyId: row.id,
      kind: 'launch',
      iso: VOYAGER_LAUNCHES[row.id]!.launchIso,
      label: 'Launch',
    },
    ...flybyEvents(row.id),
    ...VOYAGER_MILESTONES.filter((m) => m.craftId === row.id).map(
      ({ id, kind, iso, label }): MissionEvent => ({ id, bodyId: row.id, kind, iso, label }),
    ),
  ],
);
events.sort((a, b) => a.iso.localeCompare(b.iso));

const source =
  '// src/layers/missions/events/data/missionEvents.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run fetch-horizons -- voyager1 voyager2 && npm run fetch-voyager-windows && npm run build-sampled-tracks && npm run build-mission-events\n' +
  '// Source of truth:  data/raw/horizons/{500@10,500@5..500@8,500@599,500@699,500@606,500@799,500@899}/ (JPL Horizons); launch, boundary and milestone instants are cited literals\n' +
  "import type { MissionEvent } from '../@types/MissionEvent';\n\n" +
  `export const MISSION_EVENTS: readonly MissionEvent[] = ${JSON.stringify(events)};\n`;
const outPath = resolve(EVENTS_PATH);
writeFileSync(
  outPath,
  await format(source, { ...(await resolveConfig(outPath)), parser: 'typescript' }),
);
console.log(`wrote ${EVENTS_PATH}`);
