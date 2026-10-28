/**
 * EXOPLANET_PLANETS — planets of other stars as scene bodies, each hung off its
 * host's famous-star anchor. Rows from the NASA Exoplanet Archive's
 * Planetary Systems Composite Parameters (https://exoplanetarchive.ipac.caltech.edu/TAP),
 * queried 2026-10-28:
 *   select pl_name, pl_orbsmax, pl_orbper, pl_orbeccen, pl_orbincl, pl_tranmid, pl_rade
 *   from pscomppars where hostname = 'TRAPPIST-1'
 * They sit beside the solar planets until the body Layer takes the planet table.
 */

import { exoplanet } from './makers/exoplanet';
import type { ExoplanetSeed } from '../../@types/scene/ExoplanetSeed';
import type { ExoplanetBody } from '../../@types/scene/ExoplanetBody';

const TRAPPIST_1 = (
  letter: string,
  semiMajorAu: number,
  periodDays: number,
  eccentricity: number,
  inclinationDeg: number,
  transitJd: number,
  radiusEarth: number,
): ExoplanetSeed => ({
  id: `trappist-1-${letter}`,
  label: `TRAPPIST-1 ${letter}`,
  hostId: 'trappist-1',
  semiMajorAu,
  periodDays,
  eccentricity,
  inclinationDeg,
  transitJd,
  radiusEarth,
});

const SEEDS: readonly ExoplanetSeed[] = [
  TRAPPIST_1('b', 0.01154, 1.510826, 0.00622, 89.728, 2457322.514193, 1.116),
  TRAPPIST_1('c', 0.0158, 2.421937, 0.00654, 89.778, 2457282.8113871, 1.097),
  TRAPPIST_1('d', 0.02227, 4.049219, 0.00837, 89.896, 2457670.1463014, 0.788),
  TRAPPIST_1('e', 0.02925, 6.101013, 0.0051, 89.793, 2457660.3676621, 0.92),
  TRAPPIST_1('f', 0.03849, 9.20754, 0.01007, 89.74, 2457671.3737299, 1.045),
  TRAPPIST_1('g', 0.04683, 12.352446, 0.00208, 89.742, 2457665.3628439, 1.129),
  TRAPPIST_1('h', 0.06189, 18.772866, 0.00567, 89.805, 2457662.5741486, 0.755),
];

export const EXOPLANET_PLANETS: readonly ExoplanetBody[] = SEEDS.map(exoplanet);
