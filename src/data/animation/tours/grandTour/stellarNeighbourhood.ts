/**
 * Our stellar neighbourhood — the log pull-out from the Solar System to half a
 * parsec off a point near Alpha Centauri, looking back at the Sun: Alpha
 * Centauri and Proxima Centauri lower left, the Sun a point upper right. The
 * view swings under the ecliptic while the range is still small; the target
 * leans toward Alpha Centauri only once the range passes ~0.05 pc, or the Sun
 * leaps off the centre. The eye backs past Alpha Centauri, so the pair sweeps
 * in from the lower left in the last two seconds. Every pose is absolute, so a
 * skip or a Prev lands the same shot.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
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
import { FRAME_ROLL_SEC } from './frameRollSec';
import { SOLAR_SYSTEM_VIEW } from './solarSystemView';
import { STELLAR_NEIGHBOURHOOD_VIEW } from './stellarNeighbourhoodView';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const PULL_OUT_SEC = 12;
const TURN_START_SEC = 1;
const TURN_SEC = 5;
const LEAN_START_SEC = 7;
const LABEL_DELAY_SEC = 8;
const REVEAL_SEC = 2;
const DWELL_SEC = 7;
const DWELL_YAW_RAD = 0.1;

export const stellarNeighbourhood: ClipData = {
  start: 'live',
  timeline: [
    scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: 0 })),
    frameTo('ecliptic', { over: FRAME_ROLL_SEC }),
    // The Sun never moves, but a focused planet would pin the target whenever no clip runs.
    focus(null),
    // Beat 03's landed view, restated so a skip or Prev pulls out from the orbits.
    all([moveTarget(SOLAR_SYSTEM_VIEW.targetMpc, 0), dollyTo(SOLAR_SYSTEM_VIEW.distanceMpc, 0)]),
    all([
      dollyTo(STELLAR_NEIGHBOURHOOD_VIEW.distanceMpc, PULL_OUT_SEC),
      tween('roll', { to: 0, over: PULL_OUT_SEC, ease: 'easeInOutSine' }),
      seq([
        wait(TURN_START_SEC),
        aimAlong(STELLAR_NEIGHBOURHOOD_VIEW.forward, TURN_SEC, 'easeInOutSine'),
      ]),
      seq([
        wait(LEAN_START_SEC),
        moveTarget(
          STELLAR_NEIGHBOURHOOD_VIEW.targetMpc,
          PULL_OUT_SEC - LEAN_START_SEC,
          'easeInOutCubic',
        ),
      ]),
      // The star map's names; the Sun's shows since beat 03.
      seq([wait(LABEL_DELAY_SEC), show(['label:starCatalog:famousStar'], REVEAL_SEC)]),
    ]),
  ],
};

export const stellarNeighbourhoodDwell: ClipData = dwellDrift(DWELL_SEC, {
  cruiseRate: DWELL_YAW_RAD / DWELL_SEC,
});
