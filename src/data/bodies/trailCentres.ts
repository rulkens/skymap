/**
 * trailCentres — the bodies a sampled trail can be drawn around: every heliocentric
 * `ORBITAL_ELEMENTS` row with a mass in `BODY_FACTS`, reaching `TRAIL_REACH_HILL_RADII` Hill radii.
 * Derived, so a new body joins by having a fact-sheet mass.
 */

import { ORBITAL_ELEMENTS } from './orbitalElements';
import { BODY_FACTS } from './bodyFacts.generated';
import { SCALE_UNITS } from '../scaleUnits';
import { hillRadiusKm } from '../../utils/orbit/hillRadiusKm';
import type { TrailCentre } from '../../@types/rendering/sampledTrailRenderer/TrailCentre';

/**
 * How many Hill radii around a planet a trail is drawn in that planet's frame. Not 1: asteroid
 * 2026 QQ8 stays bound to Earth out to 1.58 million km, past Earth's 1.5 million km Hill radius.
 */
const TRAIL_REACH_HILL_RADII = 1.5;

export const TRAIL_CENTRES: readonly TrailCentre[] = ORBITAL_ELEMENTS.flatMap((row) => {
  const massKg = BODY_FACTS[row.id]?.massKg;
  if (row.focusId !== 'sun' || massKg === undefined) return [];
  const semiMajorKm = row.semiMajorMpc / SCALE_UNITS.KM_TO_MPC;
  return [{ id: row.id, reachKm: TRAIL_REACH_HILL_RADII * hillRadiusKm(semiMajorKm, massKg) }];
});
