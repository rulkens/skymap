/**
 * VOYAGER_ENCOUNTERS — every Voyager flyby we mark. `date` is the published encounter date and
 * only centres the dense Horizons windows (1 min ±2 d, 1 h ±60 d); the closest-approach instant
 * itself is measured from the fetched vectors. `bodyTarget` is a body centre (599, not the
 * system barycentre 5), since the distance is to the body. Titan shares V1's Saturn date.
 */
import type { VoyagerEncounter } from './@types/VoyagerEncounter';

export const VOYAGER_ENCOUNTERS: readonly VoyagerEncounter[] = [
  { craftId: 'voyager1', date: '1979-03-05', bodyName: 'Jupiter', bodyTarget: '599' },
  { craftId: 'voyager1', date: '1980-11-12', bodyName: 'Saturn', bodyTarget: '699' },
  { craftId: 'voyager1', date: '1980-11-12', bodyName: 'Titan', bodyTarget: '606' },
  { craftId: 'voyager2', date: '1979-07-09', bodyName: 'Jupiter', bodyTarget: '599' },
  { craftId: 'voyager2', date: '1981-08-26', bodyName: 'Saturn', bodyTarget: '699' },
  { craftId: 'voyager2', date: '1986-01-24', bodyName: 'Uranus', bodyTarget: '799' },
  { craftId: 'voyager2', date: '1989-08-25', bodyName: 'Neptune', bodyTarget: '899' },
];
