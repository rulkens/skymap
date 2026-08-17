/**
 * pericentreSpeedKmS — speed at pericentre of a bound two-body orbit, km/s.
 *
 *   v_peri = (2πa / P) · √((1 + e) / (1 − e))
 *
 * Kepler's third law already ties GM to this orbit's own a and P, so vis-viva
 * collapses to a form needing no central mass and no gravitational constant —
 * which is why the third argument is a period rather than a mass. For S2
 * (a = 1026 AU, e = 0.884, P = 16.0 yr) it returns ~7700 km/s against a
 * published ~7650.
 */

import { SCALE_UNITS } from '../../data/scaleUnits';

const TWO_PI = 2 * Math.PI;

// Derived, not restated: the AU is whatever IAU value SCALE_UNITS holds, and
// the year is the Julian year of 365.25 d the ephemeris assumes throughout
// (rateLadder.ts's header; its '1 yr/s' detent is the same 31_557_600 s).
const AU_IN_KM = SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.KM_TO_MPC;
const SECONDS_PER_JULIAN_YEAR = 365.25 * 24 * 60 * 60;

export function pericentreSpeedKmS(
  semiMajorAu: number,
  eccentricity: number,
  periodYr: number,
): number {
  // Speed a circular orbit of the same a and P would hold everywhere; the
  // eccentricity factor is what lifts it to the pericentre value.
  const circularSpeedKmS = (TWO_PI * semiMajorAu * AU_IN_KM) / (periodYr * SECONDS_PER_JULIAN_YEAR);

  return circularSpeedKmS * Math.sqrt((1 + eccentricity) / (1 - eccentricity));
}
