/**
 * The Solar System — the log pull-out from the Earth–Moon gap until Neptune's
 * orbit rings the frame, the view swinging up over the ecliptic as it goes so
 * the orbits open from lines into rings. Every pose is absolute (the Sun sits
 * at the origin, the planets where the tour date puts them), so a skip or a
 * Prev lands the same shot. The eye stands on Pluto's side of the Sun, which
 * drops Pluto and its caption (they share the planets' switch) below the frame.
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
import { EARTH_AND_MOON_VIEW } from './earthAndMoonView';
import { FRAME_ROLL_SEC } from './frameRollSec';
import { SOLAR_SYSTEM_VIEW } from './solarSystemView';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

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
      dollyTo(SOLAR_SYSTEM_VIEW.distanceMpc, PULL_OUT_SEC),
      aimAlong(SOLAR_SYSTEM_VIEW.forward, TURN_SEC, 'easeInOutSine'),
      tween('roll', { to: 0, over: PULL_OUT_SEC, ease: 'easeInOutSine' }),
      seq([
        wait(TURN_SEC),
        moveTarget(SOLAR_SYSTEM_VIEW.targetMpc, PULL_OUT_SEC - TURN_SEC, 'easeInOutSine'),
      ]),
      // The planets are named since beat 02; the Sun's name is the star layer's.
      seq([wait(LABEL_DELAY_SEC), show(['label:starCatalog:sun'], REVEAL_SEC)]),
    ]),
  ],
};

export const solarSystemDwell: ClipData = dwellDrift(DWELL_SEC, {
  cruiseRate: DWELL_YAW_RAD / DWELL_SEC,
});
