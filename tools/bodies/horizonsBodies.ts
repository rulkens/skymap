/**
 * HORIZONS_BODIES — the bodies `fetchHorizons` pulls and `buildEphemerisCorrections` fits.
 * Planets are the points the Kepler rows describe: Mercury and Venus themselves, the Earth–Moon
 * barycentre (3), then the Mars–Neptune system barycentres. A planet's `fitStep` keeps ≥ ~20 fit
 * samples across the shortest period its residual carries.
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
];
