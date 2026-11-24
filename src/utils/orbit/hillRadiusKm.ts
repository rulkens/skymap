/**
 * hillRadiusKm — the radius of a planet's sphere of gravitational dominance against the Sun,
 * a · ∛(m / 3·M☉), for a circular-orbit approximation (eccentricity ignored).
 */

import { SUN_MASS_KG } from '../../data/bodies/sunMassKg';

export function hillRadiusKm(semiMajorKm: number, massKg: number): number {
  return semiMajorKm * Math.cbrt(massKg / (3 * SUN_MASS_KG));
}
