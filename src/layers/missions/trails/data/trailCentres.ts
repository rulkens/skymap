/**
 * trailCentres — the planets a mission trail can be drawn around: every heliocentric
 * `ORBITAL_ELEMENTS` row with a known mass, reaching `TRAIL_REACH_HILL_RADII` Hill radii.
 * Derived so a new planet row joins by gaining a `PLANET_MASS_KG` entry.
 */

import { ORBITAL_ELEMENTS } from '../../../../data/bodies/orbitalElements';
import { PLANET_MASS_KG } from '../../../../data/bodies/planetMassKg';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { hillRadiusKm } from '../../../../utils/orbit/hillRadiusKm';
import type { TrailCentre } from '../@types/TrailCentre';
import { TRAIL_REACH_HILL_RADII } from './missionTrailStyle';

export const TRAIL_CENTRES: readonly TrailCentre[] = ORBITAL_ELEMENTS.flatMap((row) => {
  const massKg = PLANET_MASS_KG[row.id];
  if (row.focusId !== 'sun' || massKg === undefined) return [];
  const semiMajorKm = row.semiMajorMpc / SCALE_UNITS.KM_TO_MPC;
  return [{ id: row.id, reachKm: TRAIL_REACH_HILL_RADII * hillRadiusKm(semiMajorKm, massKg) }];
});
