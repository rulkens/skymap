/**
 * trailCentres — the bodies a mission trail can be drawn around: every heliocentric
 * `ORBITAL_ELEMENTS` row with a mass in `BODY_FACTS`, reaching `TRAIL_REACH_HILL_RADII` Hill radii.
 * Derived, so a new body joins by having a fact-sheet mass.
 */

import { ORBITAL_ELEMENTS } from '../../../../data/bodies/orbitalElements';
import { BODY_FACTS } from '../../../../data/bodies/bodyFacts.generated';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { hillRadiusKm } from '../../../../utils/orbit/hillRadiusKm';
import type { TrailCentre } from '../@types/TrailCentre';
import { TRAIL_REACH_HILL_RADII } from './missionTrailStyle';

export const TRAIL_CENTRES: readonly TrailCentre[] = ORBITAL_ELEMENTS.flatMap((row) => {
  const massKg = BODY_FACTS[row.id]?.massKg;
  if (row.focusId !== 'sun' || massKg === undefined) return [];
  const semiMajorKm = row.semiMajorMpc / SCALE_UNITS.KM_TO_MPC;
  return [{ id: row.id, reachKm: TRAIL_REACH_HILL_RADII * hillRadiusKm(semiMajorKm, massKg) }];
});
