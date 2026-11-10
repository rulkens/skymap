/**
 * Earth and Moon — the pull-back from the whole night-side Earth until the Moon
 * stands across the gap. The camera swings round to a view side-on to the gap,
 * looking steeply across the ecliptic (`EARTH_AND_MOON_VIEW`): both bodies show
 * near half lit, and the eye stands as far from each, so the Moon's disc is its
 * true 3.7 times smaller than Earth's. Every pose is absolute, read from the
 * tour date's ephemeris, so a skip or a Prev lands the same shot. The pull-back
 * hands over to the dwell still turning and zooming out, and the dwell coasts
 * to the view, so the camera never stops on the landing.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  aimAlong,
  all,
  dollyTo,
  focus,
  frameTo,
  moveTarget,
  rate,
  scene,
  seq,
  show,
  tween,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { clockTo } from '../../../../state/tour/clockTo';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { dwellLeadIn } from '../../../../state/tour/dwellLeadIn';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { EARTH_DATUM_RADIUS_M } from '../../../bodies/earthDatumRadiusM';
import { SCALE_UNITS } from '../../../scaleUnits';
import { EARTH_AND_MOON_VIEW } from './earthAndMoonView';
import { FRAME_ROLL_SEC } from './frameRollSec';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';
import { WHOLE_EARTH_HEIGHT_M } from './wholeEarthHeightM';

const EARTH_MPC = bodyPositionMpcAt('earth', TOUR_NIGHT_SIM_DAYS);
const WHOLE_EARTH_RANGE_MPC = (EARTH_DATUM_RADIUS_M + WHOLE_EARTH_HEIGHT_M) * SCALE_UNITS.M_TO_MPC;

const PULL_BACK_SEC = 8;
// The target leaves Earth only once the range has grown, or the linear slide
// outruns the log dolly and Earth swings out of frame mid-move.
const TARGET_DELAY_SEC = 3;
const LABEL_DELAY_SEC = 6;
const REVEAL_SEC = 2;
const DWELL_SEC = 7;
const DWELL_YAW_RAD = 0.1;
const DWELL_YAW_RATE = DWELL_YAW_RAD / DWELL_SEC;
const LEAD_IN_SEC = 3;
// The zoom's speed at the hand-over, as a fraction of the range per second.
const COAST_LOG_RATE = 0.12;
// Both coasts ease their speed symmetrically, so each covers half of speed × time.
const HANDOVER_MPC = EARTH_AND_MOON_VIEW.distanceMpc / (1 + (COAST_LOG_RATE * DWELL_SEC) / 2);
const COAST_MPC_PER_SEC = COAST_LOG_RATE * HANDOVER_MPC;
const PULL_BACK_MPC = HANDOVER_MPC - (COAST_MPC_PER_SEC * LEAD_IN_SEC) / 2;

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
      dollyTo(PULL_BACK_MPC, PULL_BACK_SEC),
      aimAlong(EARTH_AND_MOON_VIEW.forward, PULL_BACK_SEC, 'easeInOutSine'),
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
      seq([
        wait(PULL_BACK_SEC - LEAD_IN_SEC),
        all([
          dwellLeadIn(DWELL_YAW_RATE, LEAD_IN_SEC),
          rate('distance', { to: COAST_MPC_PER_SEC, over: LEAD_IN_SEC, ease: 'easeInOutSine' }),
        ]),
      ]),
    ]),
  ],
};

export const earthAndMoonDwell: ClipData = dwellDrift(DWELL_SEC, {
  cruiseRate: DWELL_YAW_RATE,
  flowIn: true,
  coastMpcPerSec: COAST_MPC_PER_SEC,
});
