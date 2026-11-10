/**
 * EARTH_AND_MOON_VIEW — the view beat 02 lands on (forward, orbit target,
 * range), read from the tour date's ephemeris, so a date change re-derives it.
 * Beat 03 restates the target and range, so a skip or Prev starts its pull-out
 * from the same view.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { cross3 } from '../../../../utils/math/cross3';
import { degToRad } from '../../../../utils/math/degToRad';
import { dot3 } from '../../../../utils/math/dot3';
import { lerpVec3 } from '../../../../utils/math/lerpVec3';
import { normalize3 } from '../../../../utils/math/normalize3';
import { ECLIPTIC_FRAME } from '../../../bodies/orbitPlaneFrames';
import { SCALE_UNITS } from '../../../scaleUnits';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const EARTH_MPC = bodyPositionMpcAt('earth', TOUR_NIGHT_SIM_DAYS);
const MOON_MPC = bodyPositionMpcAt('moon', TOUR_NIGHT_SIM_DAYS);
const SUN_MPC = bodyPositionMpcAt('sun', TOUR_NIGHT_SIM_DAYS);
const GAP_DIR = normalize3([0, 1, 2].map((i) => MOON_MPC[i]! - EARTH_MPC[i]!) as Vec3);
const SUN_DIR = normalize3([0, 1, 2].map((i) => SUN_MPC[i]! - EARTH_MPC[i]!) as Vec3);
const { normal } = ECLIPTIC_FRAME;

// Square to both the gap and the Sun is the ecliptic pole (all three lie near
// the ecliptic), where a pole-up view has no heading. So the eye looks steeply
// across the ecliptic instead: the Sun lies in it, so both bodies show near half
// lit whatever the Moon's phase. The heading turns GAP_RISE_RAD off square to
// the gap, which tilts the gap about that much on screen. The pitch is taken
// from the ecliptic, not the gap: this steep, the Moon's ±5° latitude would
// otherwise swing that tilt by ±20°.
const PITCH_RAD = degToRad(80);
const GAP_RISE_RAD = degToRad(34);
const SQUARE_DIR = normalize3(cross3(normal, GAP_DIR));

/** Looking toward ecliptic north (`side` 1) or south (−1); Earth lower left either way. */
const forwardFrom = (side: 1 | -1): Vec3 => {
  const heading = -side * GAP_RISE_RAD;
  return normalize3(
    [0, 1, 2].map(
      (i) =>
        Math.cos(PITCH_RAD) *
          (Math.cos(heading) * SQUARE_DIR[i]! + Math.sin(heading) * GAP_DIR[i]!) +
        side * Math.sin(PITCH_RAD) * normal[i]!,
    ) as Vec3,
  );
};
// The side whose view stands nearer square to the Sun sees both nearer half lit.
const NORTHWARD = forwardFrom(1);
const SOUTHWARD = forwardFrom(-1);
const FORWARD =
  Math.abs(dot3(NORTHWARD, SUN_DIR)) <= Math.abs(dot3(SOUTHWARD, SUN_DIR)) ? NORTHWARD : SOUTHWARD;

const GAP_VIEW_DISTANCE_KM = 340_000;
const DISTANCE_MPC = GAP_VIEW_DISTANCE_KM * SCALE_UNITS.KM_TO_MPC;
// An eye as far from Earth as from the Moon draws their discs at their true size
// ratio, so the aim slides off the gap's middle by the view's lean along it.
const AIM_SLIDE_MPC = DISTANCE_MPC * dot3(FORWARD, GAP_DIR);
const GAP_MIDDLE_MPC = lerpVec3(EARTH_MPC, MOON_MPC, 0.5);

export const EARTH_AND_MOON_VIEW = {
  forward: FORWARD,
  targetMpc: [0, 1, 2].map((i) => GAP_MIDDLE_MPC[i]! + GAP_DIR[i]! * AIM_SLIDE_MPC) as Vec3,
  distanceMpc: DISTANCE_MPC,
} as const;
