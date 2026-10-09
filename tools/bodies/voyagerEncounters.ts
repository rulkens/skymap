/**
 * VOYAGER_ENCOUNTERS — every Voyager flyby we mark. `date` is the published encounter date; it
 * only centres the fetch windows (1 min ±2 d; 1 h ±60 d Sun-chain, ±120 d DE441 pair), and the
 * closest-approach instant itself comes from Horizons. Titan shares V1's Saturn date.
 */
import type { VoyagerEncounter } from './@types/VoyagerEncounter';

export const VOYAGER_ENCOUNTERS: readonly VoyagerEncounter[] = [
  {
    craftId: 'voyager1',
    date: '1979-03-05',
    bodyName: 'Jupiter',
    bodyTarget: '599',
    baryTarget: '5',
  },
  {
    craftId: 'voyager1',
    date: '1980-11-12',
    bodyName: 'Saturn',
    bodyTarget: '699',
    baryTarget: '6',
  },
  {
    craftId: 'voyager1',
    date: '1980-11-12',
    bodyName: 'Titan',
    bodyTarget: '606',
    baryTarget: '6',
  },
  {
    craftId: 'voyager2',
    date: '1979-07-09',
    bodyName: 'Jupiter',
    bodyTarget: '599',
    baryTarget: '5',
  },
  {
    craftId: 'voyager2',
    date: '1981-08-26',
    bodyName: 'Saturn',
    bodyTarget: '699',
    baryTarget: '6',
  },
  {
    craftId: 'voyager2',
    date: '1986-01-24',
    bodyName: 'Uranus',
    bodyTarget: '799',
    baryTarget: '7',
  },
  {
    craftId: 'voyager2',
    date: '1989-08-25',
    bodyName: 'Neptune',
    bodyTarget: '899',
    baryTarget: '8',
  },
];
