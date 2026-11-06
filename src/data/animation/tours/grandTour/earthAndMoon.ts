/**
 * Earth and Moon — the pull-back from the whole night-side Earth until the Moon
 * stands across the gap. The tour date is a new Moon: 389,000 km out and 4° from
 * the Sun's direction, so from the night side the Moon hides behind Earth with
 * its lit face turned away. The camera swings off the Earth–Moon line as it
 * pulls back, to a side-on view turned sunward of square, where Earth shows
 * gibbous and the Moon more than half lit. Every pose is absolute, read from the
 * tour date's ephemeris, so a skip or a Prev lands the same shot.
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
import { cross3 } from '../../../../utils/math/cross3';
import { degToRad } from '../../../../utils/math/degToRad';
import { normalize3 } from '../../../../utils/math/normalize3';
import { EARTH_DATUM_RADIUS_M } from '../../../bodies/earthDatumRadiusM';
import { ECLIPTIC_FRAME } from '../../../bodies/orbitPlaneFrames';
import { SCALE_UNITS } from '../../../scaleUnits';
import { EARTH_AND_MOON_VIEW } from './earthAndMoonView';
import { FRAME_ROLL_SEC } from './frameRollSec';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';
import { WHOLE_EARTH_HEIGHT_M } from './wholeEarthHeightM';

const EARTH_MPC = bodyPositionMpcAt('earth', TOUR_NIGHT_SIM_DAYS);
const MOON_MPC = bodyPositionMpcAt('moon', TOUR_NIGHT_SIM_DAYS);
const GAP_DIR = normalize3([
  MOON_MPC[0] - EARTH_MPC[0],
  MOON_MPC[1] - EARTH_MPC[1],
  MOON_MPC[2] - EARTH_MPC[2],
]);

/** `a` turned by `rad` toward `b` (both unit, square to each other). */
const turned = (a: Vec3, b: Vec3, rad: number): Vec3 =>
  normalize3([0, 1, 2].map((i) => a[i]! * Math.cos(rad) + b[i]! * Math.sin(rad)) as Vec3);

// Square to the gap and level with the ecliptic, the gap runs flat across the
// frame (the Moon is 4° off the ecliptic). Turned OFF_LEVEL_RAD about the gap,
// the eye looks down on the Moon's orbit, the Moon rises to the upper right and
// the outer planets leave the frame (their captions share the Moon's switch);
// turned SUNWARD_RAD, the eye sees the Moon gibbous at some foreshortening.
const SQUARE_DIR = normalize3(cross3(ECLIPTIC_FRAME.normal, GAP_DIR));
const OFF_LEVEL_RAD = degToRad(50);
const SUNWARD_RAD = degToRad(40);
const VIEW_FORWARD = turned(
  turned(SQUARE_DIR, cross3(GAP_DIR, SQUARE_DIR), OFF_LEVEL_RAD),
  [-GAP_DIR[0], -GAP_DIR[1], -GAP_DIR[2]],
  SUNWARD_RAD,
);
const WHOLE_EARTH_RANGE_MPC = (EARTH_DATUM_RADIUS_M + WHOLE_EARTH_HEIGHT_M) * SCALE_UNITS.M_TO_MPC;

const PULL_BACK_SEC = 8;
// The target leaves Earth only once the range has grown, or the linear slide
// outruns the log dolly and Earth swings out of frame mid-move.
const TARGET_DELAY_SEC = 3;
const LABEL_DELAY_SEC = 6;
const REVEAL_SEC = 2;
const DWELL_SEC = 7;
const DWELL_YAW_RAD = 0.1;

export const earthAndMoon: ClipData = {
  start: 'live',
  timeline: [
    scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: 0 })),
    // The Moon and the planets orbit near the ecliptic, so its pole is up from
    // here to the Milky Way beat; stated on entry, as the date is.
    frameTo('ecliptic', { over: FRAME_ROLL_SEC }),
    // A focused moving body pins the target to its centre whenever no clip runs
    // (a tour pause), and this shot is centred on the gap.
    focus(null),
    // Beat 01's last view, restated so a skip or Prev pulls back from the whole Earth.
    all([moveTarget(EARTH_MPC, 0), dollyTo(WHOLE_EARTH_RANGE_MPC, 0)]),
    all([
      dollyTo(EARTH_AND_MOON_VIEW.distanceMpc, PULL_BACK_SEC),
      aimAlong(VIEW_FORWARD, PULL_BACK_SEC, 'easeInOutSine'),
      // Beat 01's ground-up rise lands rolled; level again, whatever came before.
      tween('roll', { to: 0, over: PULL_BACK_SEC, ease: 'easeInOutSine' }),
      seq([
        wait(TARGET_DELAY_SEC),
        moveTarget(
          EARTH_AND_MOON_VIEW.targetMpc,
          PULL_BACK_SEC - TARGET_DELAY_SEC,
          'easeInOutSine',
        ),
      ]),
      // Planets and moons: the Moon is the first name a beat gives back.
      seq([wait(LABEL_DELAY_SEC), show(['label:body:planet'], REVEAL_SEC)]),
    ]),
  ],
};

export const earthAndMoonDwell: ClipData = dwellDrift(DWELL_SEC, {
  cruiseRate: DWELL_YAW_RAD / DWELL_SEC,
});
