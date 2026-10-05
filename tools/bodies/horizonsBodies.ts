/**
 * HORIZONS_BODIES — the bodies `fetchHorizons` pulls and `buildEphemerisCorrections` fits.
 * Planets are the points the Kepler rows describe: Mercury and Venus themselves, the Earth–Moon
 * barycentre (3), then the Mars–Neptune system barycentres. A planet's `fitStep` keeps ≥ ~20 fit
 * samples across the shortest period its residual carries. A moon is queried against its
 * parent's centre at a step ≤ P/16 that divides a day (whole-minute, grid-aligned fetch pieces),
 * fitted at ≈ P/8 (Iapetus every 2 days: its residual carries Titan's ~16-day pull, which a
 * P/8 grid aliases), and switches its correction off outside the span.
 */
import type { HorizonsBody } from './@types/HorizonsBody';

export const HORIZONS_BODIES: readonly HorizonsBody[] = [
  { id: 'mercury', target: '199', centre: '500@10', stepDays: 1, fitStep: 2, outside: 'hold' },
  { id: 'venus', target: '299', centre: '500@10', stepDays: 1, fitStep: 4, outside: 'hold' },
  { id: 'earth', target: '3', centre: '500@10', stepDays: 1, fitStep: 4, outside: 'hold' },
  { id: 'mars', target: '4', centre: '500@10', stepDays: 1, fitStep: 6, outside: 'hold' },
  { id: 'jupiter', target: '5', centre: '500@10', stepDays: 1, fitStep: 10, outside: 'hold' },
  { id: 'saturn', target: '6', centre: '500@10', stepDays: 1, fitStep: 10, outside: 'hold' },
  { id: 'uranus', target: '7', centre: '500@10', stepDays: 1, fitStep: 10, outside: 'hold' },
  { id: 'neptune', target: '8', centre: '500@10', stepDays: 1, fitStep: 10, outside: 'hold' },
  { id: 'io', target: '501', centre: '500@599', stepDays: 1 / 10, fitStep: 2, outside: 'off' },
  { id: 'europa', target: '502', centre: '500@599', stepDays: 1 / 5, fitStep: 2, outside: 'off' },
  { id: 'ganymede', target: '503', centre: '500@599', stepDays: 1 / 3, fitStep: 2, outside: 'off' },
  { id: 'callisto', target: '504', centre: '500@599', stepDays: 1, fitStep: 2, outside: 'off' },
  { id: 'mimas', target: '601', centre: '500@699', stepDays: 1 / 18, fitStep: 2, outside: 'off' },
  {
    id: 'enceladus',
    target: '602',
    centre: '500@699',
    stepDays: 1 / 12,
    fitStep: 2,
    outside: 'off',
  },
  { id: 'tethys', target: '603', centre: '500@699', stepDays: 1 / 9, fitStep: 2, outside: 'off' },
  { id: 'dione', target: '604', centre: '500@699', stepDays: 1 / 6, fitStep: 2, outside: 'off' },
  { id: 'rhea', target: '605', centre: '500@699', stepDays: 1 / 4, fitStep: 2, outside: 'off' },
  { id: 'titan', target: '606', centre: '500@699', stepDays: 1 / 2, fitStep: 4, outside: 'off' },
  { id: 'iapetus', target: '608', centre: '500@699', stepDays: 1, fitStep: 2, outside: 'off' },
];
