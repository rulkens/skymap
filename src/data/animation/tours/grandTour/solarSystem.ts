/**
 * The Solar System — the log pull-out from the Earth–Moon gap until Neptune's
 * orbit rings the frame, the view swinging up over the ecliptic as it goes so
 * the orbits open from lines into rings. Every pose is absolute (the Sun sits
 * at the origin, the planets where the tour date puts them), so a skip or a
 * Prev lands the same shot. The eye stands on Pluto's side of the Sun, which
 * drops Pluto and its caption (they share the planets' switch) below the frame.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  aimAlong,
  all,
  dollyTo,
  focus,
  frameTo,
  moveTarget,
  scene,
  seq,
  show,
  tween,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { clockTo } from '../../../../state/tour/clockTo';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { degToRad } from '../../../../utils/math/degToRad';
import { ECLIPTIC_FRAME } from '../../../bodies/orbitPlaneFrames';
import { SCALE_UNITS } from '../../../scaleUnits';
import { EARTH_AND_MOON_VIEW } from './earthAndMoonView';
import { FRAME_ROLL_SEC } from './frameRollSec';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const { xAxis, yAxis, normal } = ECLIPTIC_FRAME;

// Looking down 35° from ecliptic north toward longitude 125°: Pluto, at 304°,
// lies on the eye's side of the Sun.
const VIEW_LONGITUDE_RAD = degToRad(125);
const VIEW_ELEVATION_RAD = degToRad(-35);
const VIEW_FORWARD: Vec3 = [0, 1, 2].map(
  (i) =>
    Math.cos(VIEW_ELEVATION_RAD) *
      (Math.cos(VIEW_LONGITUDE_RAD) * xAxis[i]! + Math.sin(VIEW_LONGITUDE_RAD) * yAxis[i]!) +
    Math.sin(VIEW_ELEVATION_RAD) * normal[i]!,
) as Vec3;
// Perspective swells the near side of the orbits, so the aim drops below the Sun
// on its ecliptic axis to centre Neptune's orbit; on that axis the dwell's yaw
// circles the Sun.
const AIM_BELOW_SUN_AU = 10;
const SUN_MPC = bodyPositionMpcAt('sun', TOUR_NIGHT_SIM_DAYS);
const AIM_MPC = [0, 1, 2].map(
  (i) => SUN_MPC[i]! - normal[i]! * AIM_BELOW_SUN_AU * SCALE_UNITS.AU_TO_MPC,
) as Vec3;
const VIEW_DISTANCE_AU = 52;

const PULL_OUT_SEC = 10;
// The view turns about the gap while the range is small, so the eye does not
// dolly back past the Sun, then the target leans to the Sun: the range passes
// 1 au only half way through the log dolly, and a slide before that would drag
// Earth off the frame.
const TURN_SEC = 5;
const LABEL_DELAY_SEC = 6;
const REVEAL_SEC = 2;
const DWELL_SEC = 8;
const DWELL_YAW_RAD = 0.15;

export const solarSystem: ClipData = {
  start: 'live',
  timeline: [
    scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: 0 })),
    frameTo('ecliptic', { over: FRAME_ROLL_SEC }),
    // The Sun never moves, but a focused planet would pin the target whenever no clip runs.
    focus(null),
    // Beat 02's landed view, restated so a skip or Prev pulls out from the gap.
    all([
      moveTarget(EARTH_AND_MOON_VIEW.targetMpc, 0),
      dollyTo(EARTH_AND_MOON_VIEW.distanceMpc, 0),
    ]),
    all([
      dollyTo(VIEW_DISTANCE_AU * SCALE_UNITS.AU_TO_MPC, PULL_OUT_SEC),
      aimAlong(VIEW_FORWARD, TURN_SEC, 'easeInOutSine'),
      tween('roll', { to: 0, over: PULL_OUT_SEC, ease: 'easeInOutSine' }),
      seq([wait(TURN_SEC), moveTarget(AIM_MPC, PULL_OUT_SEC - TURN_SEC, 'easeInOutSine')]),
      // The planets are named since beat 02; the Sun's name is the star layer's.
      seq([wait(LABEL_DELAY_SEC), show(['label:starCatalog:sun'], REVEAL_SEC)]),
    ]),
  ],
};

export const solarSystemDwell: ClipData = dwellDrift(DWELL_SEC, {
  cruiseRate: DWELL_YAW_RAD / DWELL_SEC,
});
