/**
 * orbiter — row maker for a spacecraft orbiting a planet, from one JPL Horizons
 * ELEMENTS column set (`REF_PLANE='FRAME'`, KM-D) plus the node rate read off a
 * multi-day span. Horizons publishes at the FETCH epoch and this table is
 * authored at J2000, so M and Ω are back-propagated at their own rates; M stays
 * UNWRAPPED, exactly as in `probe`.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { degToRad } from '../../../utils/math/degToRad';
import { CONST_J2000 } from '../../time/constJ2000';
import { planeFrameFromPole } from '../orbitPlaneFrames';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../../@types/math/Vec3';

const DAYS_PER_JULIAN_CENTURY = 36_525;

export function orbiter(spec: {
  id: string;
  focusId: string;
  /** JDTDB the columns below were fetched at. */
  epochJd: number;
  /** Horizons `A`, km. */
  semiMajorKm: number;
  eccentricity: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  /** Horizons `N`, mean motion, degrees per day. */
  meanMotionDegPerDay: number;
  /** ΔΩ per day across the fetch span — negative for a prograde orbiter. */
  nodeRateDegPerDay: number;
  /**
   * The pole of the plane Ω is measured in. `planeFrameFromPole` puts the
   * frame's x-axis at pole RA + 90°, so Horizons' `FRAME` (ICRF equator, Ω from
   * the equinox) is `270 / 90`.
   */
  poleRaDeg: number;
  poleDecDeg: number;
  color: Vec3;
}): OrbitalElements {
  const daysToJ2000 = CONST_J2000 - spec.epochJd;

  return {
    id: spec.id,
    focusId: spec.focusId,
    semiMajorMpc: spec.semiMajorKm * SCALE_UNITS.KM_TO_MPC,
    eccentricity: spec.eccentricity,
    inclinationRad: degToRad(spec.inclinationDeg),
    ascendingNodeRad: degToRad(spec.ascendingNodeDeg + spec.nodeRateDegPerDay * daysToJ2000),
    argPeriapsisRad: degToRad(spec.argPeriapsisDeg),
    meanAnomalyRad: degToRad(spec.meanAnomalyDeg + spec.meanMotionDegPerDay * daysToJ2000),
    meanAnomalyRateRadPerCty: degToRad(spec.meanMotionDegPerDay) * DAYS_PER_JULIAN_CENTURY,
    ascendingNodeRateRadPerCty: degToRad(spec.nodeRateDegPerDay) * DAYS_PER_JULIAN_CENTURY,
    // The apsis of a near-circular orbit has no meaningful direction to drift
    // in, the same degeneracy `moonRatesFromPeriods` guards with its sentinel.
    argPeriapsisRateRadPerCty: 0,
    color: spec.color,
    plane: planeFrameFromPole(spec.poleRaDeg, spec.poleDecDeg),
  };
}
