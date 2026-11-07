/**
 * STELLAR_NEIGHBOURHOOD_VIEW — the view beat 04 lands on (forward, orbit
 * target, range), read from the tour date's ephemeris. Beat 05 restates it, so
 * a skip or Prev starts its pull-out from the same view.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { degToRad } from '../../../../utils/math/degToRad';
import { lerpVec3 } from '../../../../utils/math/lerpVec3';
import { ECLIPTIC_FRAME } from '../../../bodies/orbitPlaneFrames';
import { SCALE_UNITS } from '../../../scaleUnits';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const { xAxis, yAxis, normal } = ECLIPTIC_FRAME;

// Looking 30° up across the ecliptic toward longitude 110°, from this close
// to the pair: Proxima stands ~150 px off Alpha Centauri, so their names do not
// collide. Every view that frames both and the Sun puts about a dozen more
// star-map names in frame; this one keeps them few.
const VIEW_LONGITUDE_RAD = degToRad(110);
const VIEW_ELEVATION_RAD = degToRad(30);
const AIM_TOWARD_ALPHA_CEN = 0.8;
const VIEW_DISTANCE_PC = 0.5;

export const STELLAR_NEIGHBOURHOOD_VIEW = {
  forward: [0, 1, 2].map(
    (i) =>
      Math.cos(VIEW_ELEVATION_RAD) *
        (Math.cos(VIEW_LONGITUDE_RAD) * xAxis[i]! + Math.sin(VIEW_LONGITUDE_RAD) * yAxis[i]!) +
      Math.sin(VIEW_ELEVATION_RAD) * normal[i]!,
  ) as Vec3,
  targetMpc: lerpVec3(
    bodyPositionMpcAt('sun', TOUR_NIGHT_SIM_DAYS),
    bodyPositionMpcAt('alpha-centauri', TOUR_NIGHT_SIM_DAYS),
    AIM_TOWARD_ALPHA_CEN,
  ),
  distanceMpc: VIEW_DISTANCE_PC * SCALE_UNITS.PC_TO_MPC,
} as const;
