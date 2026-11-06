/**
 * EARTH_AND_MOON_VIEW — the orbit target and range beat 02 lands on, read from
 * the tour date's ephemeris. Beat 03 restates them, so a skip or Prev starts
 * its pull-out from the same view.
 */

import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { lerpVec3 } from '../../../../utils/math/lerpVec3';
import { SCALE_UNITS } from '../../../scaleUnits';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

// Moonward of the middle: beat 02's sunward eye stands nearer the Moon, which
// pushes it out toward the frame's edge.
const GAP_AIM_FRACTION = 0.7;
const GAP_VIEW_DISTANCE_KM = 240_000;

export const EARTH_AND_MOON_VIEW = {
  targetMpc: lerpVec3(
    bodyPositionMpcAt('earth', TOUR_NIGHT_SIM_DAYS),
    bodyPositionMpcAt('moon', TOUR_NIGHT_SIM_DAYS),
    GAP_AIM_FRACTION,
  ),
  distanceMpc: GAP_VIEW_DISTANCE_KM * SCALE_UNITS.KM_TO_MPC,
} as const;
