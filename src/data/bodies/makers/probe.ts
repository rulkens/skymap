/**
 * probe — row maker for a deep-space spacecraft, from one JPL Horizons ELEMENTS
 * column set (heliocentric, `REF_PLANE='ECLIPTIC'`, AU-D).
 *
 * Horizons publishes at the FETCH epoch and this table is authored at J2000, so
 * the epoch shift must not be hand-typed: M comes from `Tp` alone, leaving the
 * `MA` column unread and free as an external cross-check in the test.
 *
 * M is left UNWRAPPED (Voyager 1's is ~1249.8°) and a hyperbolic `A` keeps its
 * NEGATIVE sign: folding either "tidy" would move the probe off its trajectory.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { degToRad } from '../../../utils/math/degToRad';
import { CONST_J2000 } from '../../time/constJ2000';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../../@types/math/Vec3';

const DAYS_PER_JULIAN_CENTURY = 36_525;

export function probe(spec: {
  id: string;
  focusId: string;
  /** Horizons `A`, au. NEGATIVE for a hyperbola. */
  semiMajorAu: number;
  /** Horizons `EC`. > 1 for a hyperbola. */
  eccentricity: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  /** Horizons `Tp`, the periapsis Julian Date. M at J2000 is derived from it. */
  periapsisJd: number;
  /** Horizons `N`, mean motion, degrees per day. */
  meanMotionDegPerDay: number;
  color: Vec3;
}): OrbitalElements {
  return {
    id: spec.id,
    focusId: spec.focusId,
    semiMajorMpc: spec.semiMajorAu * SCALE_UNITS.AU_TO_MPC,
    eccentricity: spec.eccentricity,
    inclinationRad: degToRad(spec.inclinationDeg),
    ascendingNodeRad: degToRad(spec.ascendingNodeDeg),
    argPeriapsisRad: degToRad(spec.argPeriapsisDeg),
    meanAnomalyRad: degToRad(spec.meanMotionDegPerDay * (CONST_J2000 - spec.periapsisJd)),
    meanAnomalyRateRadPerCty: degToRad(spec.meanMotionDegPerDay) * DAYS_PER_JULIAN_CENTURY,
    color: spec.color,
  };
}
