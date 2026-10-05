// src/data/missions/missionEvents.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run fetch-horizons -- voyager1 voyager2 && npm run fetch-voyager-windows && npm run build-spacecraft-tracks
// Source of truth:  data/raw/horizons/500@10/ (JPL Horizons); heliopause dates are cited literals
import type { MissionEvent } from '../../@types/missions/MissionEvent';

export const MISSION_EVENTS: readonly MissionEvent[] = [
  { bodyId: 'voyager1', kind: 'launch', iso: '1977-09-06T00:00:00.000Z', label: 'Launch' },
  {
    bodyId: 'voyager1',
    kind: 'flyby',
    iso: '1979-03-05T12:04:32.012Z',
    label: 'Jupiter closest approach',
  },
  {
    bodyId: 'voyager1',
    kind: 'flyby',
    iso: '1980-11-12T23:45:21.844Z',
    label: 'Saturn closest approach',
  },
  {
    bodyId: 'voyager1',
    kind: 'flyby',
    iso: '1980-11-12T05:39:58.550Z',
    label: 'Titan closest approach',
  },
  {
    bodyId: 'voyager1',
    kind: 'heliopause',
    iso: '2012-08-25T00:00:00.000Z',
    label: 'Heliopause crossing',
  },
  { bodyId: 'voyager2', kind: 'launch', iso: '1977-08-21T00:00:00.000Z', label: 'Launch' },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1979-07-09T22:29:04.061Z',
    label: 'Jupiter closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1981-08-26T03:23:03.453Z',
    label: 'Saturn closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1986-01-24T17:56:50.311Z',
    label: 'Uranus closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'flyby',
    iso: '1989-08-25T04:01:51.633Z',
    label: 'Neptune closest approach',
  },
  {
    bodyId: 'voyager2',
    kind: 'heliopause',
    iso: '2018-11-05T00:00:00.000Z',
    label: 'Heliopause crossing',
  },
];
