/**
 * SOLAR_SYSTEM_VIEW — the view beat 03 lands on (forward, orbit target, range),
 * read from the tour date's ephemeris. Beat 04 restates the target and range,
 * so a skip or Prev starts its pull-out from the same view.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { degToRad } from '../../../../utils/math/degToRad';
import { ECLIPTIC_FRAME } from '../../../bodies/orbitPlaneFrames';
import { SCALE_UNITS } from '../../../scaleUnits';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const { xAxis, yAxis, normal } = ECLIPTIC_FRAME;

// Looking down 35° from ecliptic north toward longitude 125°: Pluto, at 304°,
// lies on the eye's side of the Sun.
const VIEW_LONGITUDE_RAD = degToRad(125);
const VIEW_ELEVATION_RAD = degToRad(-35);
// Perspective swells the near side of the orbits, so the aim drops below the Sun
// on its ecliptic axis to centre Neptune's orbit; on that axis the dwell's yaw
// circles the Sun.
const AIM_BELOW_SUN_AU = 10;
const VIEW_DISTANCE_AU = 52;
const SUN_MPC = bodyPositionMpcAt('sun', TOUR_NIGHT_SIM_DAYS);

export const SOLAR_SYSTEM_VIEW = {
  forward: [0, 1, 2].map(
    (i) =>
      Math.cos(VIEW_ELEVATION_RAD) *
        (Math.cos(VIEW_LONGITUDE_RAD) * xAxis[i]! + Math.sin(VIEW_LONGITUDE_RAD) * yAxis[i]!) +
      Math.sin(VIEW_ELEVATION_RAD) * normal[i]!,
  ) as Vec3,
  targetMpc: [0, 1, 2].map(
    (i) => SUN_MPC[i]! - normal[i]! * AIM_BELOW_SUN_AU * SCALE_UNITS.AU_TO_MPC,
  ) as Vec3,
  distanceMpc: VIEW_DISTANCE_AU * SCALE_UNITS.AU_TO_MPC,
} as const;
