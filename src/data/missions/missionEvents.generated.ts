// src/data/missions/missionEvents.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run fetch-horizons -- voyager1 voyager2 && npm run fetch-voyager-windows && npm run build-spacecraft-tracks
// Source of truth:  data/raw/horizons/{500@10,500@5..500@8,500@599,500@699,500@606,500@799,500@899}/ (JPL Horizons); launch and heliopause instants are cited literals
import type { MissionEvent } from '../../@types/missions/MissionEvent';

export const MISSION_EVENTS: readonly MissionEvent[] = [
  { bodyId: 'voyager2', kind: 'launch', iso: '1977-08-20T14:29:00.000Z', label: 'Launch' },
  { bodyId: 'voyager1', kind: 'launch', iso: '1977-09-05T12:56:00.000Z', label: 'Launch' },
  {
    bodyId: 'voyager1',
    kind: 'flyby',
    iso: '1979-03-05T12:04:35.394Z',
    label: 'Jupiter closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1979-07-09T22:29:01.306Z',
    label: 'Jupiter closest approach',
  },
  {
    bodyId: 'voyager1',
    kind: 'flyby',
    iso: '1980-11-12T05:40:22.393Z',
    label: 'Titan closest approach',
  },
  {
    bodyId: 'voyager1',
    kind: 'flyby',
    iso: '1980-11-12T23:45:37.581Z',
    label: 'Saturn closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1981-08-26T03:24:04.587Z',
    label: 'Saturn closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1986-01-24T17:58:51.349Z',
    label: 'Uranus closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1989-08-25T03:55:40.084Z',
    label: 'Neptune closest approach',
  },
  {
    bodyId: 'voyager1',
    kind: 'heliopause',
    iso: '2012-08-25T00:00:00.000Z',
    label: 'Heliopause crossing',
  },
  {
    bodyId: 'voyager2',
    kind: 'heliopause',
    iso: '2018-11-05T00:00:00.000Z',
    label: 'Heliopause crossing',
  },
];
