/**
 * You are here — the rise from the park to the whole Earth, one clip in three
 * frame legs. `{ sky }`: from beat 00's night view, look down at your feet.
 * `{ body }`: only `distance` moves, so the eye climbs straight up the park's
 * radial: Copenhagen, then Denmark, then the curve of the planet. World: the
 * last of the pull-back, so the dwell drifts in the frame every later beat flies
 * in. Each leg's start is converted from the pose the last one left, so neither
 * handover moves the eye: one at rest (the nadir), one at speed.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import {
  all,
  dollyTo,
  moveTargetId,
  scene,
  show,
  tween,
} from '../../../../services/engine/animation/effectHelpers';
import { BODY_FOCUS_PREFIX } from '../../../../services/url/bodyFocusId';
import { clockTo } from '../../../../state/tour/clockTo';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { focusId } from '../../../../utils/animation/focusId';
import { EARTH_DATUM_RADIUS_M } from '../../../bodies/earthDatumRadiusM';
import { SCALE_UNITS } from '../../../scaleUnits';
import { OPENING_HIDDEN_LAYERS } from './openingHiddenLayers';
import { PARK_VIEW } from './parkView';
import { SONDERMARKEN_SPOT } from './sondermarkenSpot';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const SKY: PoseFrame = { sky: SONDERMARKEN_SPOT };
const HOST: PoseFrame = { body: SONDERMARKEN_SPOT.body };
const EARTH = focusId(`${BODY_FOCUS_PREFIX}${SONDERMARKEN_SPOT.body}`);

const LOOK_DOWN_SEC = 4;
const RISE_SEC = 8;
// Picked so the world dolly opens at about the log speed the rise leaves at
// (easeInSine out, easeOutCubic in): the handover carries on at pace.
const PULL_BACK_SEC = 3;
const REVEAL_SEC = 2;
const DWELL_SEC = 7;

// Height above the ground where the body leg hands over: Denmark small, the
// planet's curve at the frame's edge.
const RISE_TOP_M = 2_000_000;
// The end height. Every `distance` here runs from the ground below: a world leg
// opened from a body leg keeps its target where the sightline meets the ground
// (`toWorldArm`).
const WHOLE_EARTH_HEIGHT_M = 20_000_000;

export const youAreHereEarth: ClipData = {
  start: 'live',
  timeline: [
    scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: 0 })),
    // Beat 00's last view, restated so a skip or Prev starts the rise in the park.
    all([
      tween('yaw', { to: PARK_VIEW.azimuthRad, over: 0, frame: SKY }),
      tween('pitch', { to: PARK_VIEW.nightAltitudeRad, over: 0, frame: SKY }),
    ]),
    // Due north at the nadir: a body leg levels screen-up on Earth's pole and has
    // no roll channel, so any other azimuth would snap as a roll at the handover.
    all([
      tween('yaw', { to: 0, over: LOOK_DOWN_SEC, frame: SKY }),
      tween('pitch', { to: -Math.PI / 2, over: LOOK_DOWN_SEC, frame: SKY }),
    ]),
    // The leg opens with the target on the ground below and `distance` the eye's
    // height above it, so this one channel lifts the eye straight up.
    tween('distance', { to: RISE_TOP_M, over: RISE_SEC, ease: 'easeInSine', frame: HOST }),
    all([
      dollyTo(WHOLE_EARTH_HEIGHT_M * SCALE_UNITS.M_TO_MPC, PULL_BACK_SEC, 'easeOutCubic'),
      // Beat 00 hid these over the park; from orbit they belong to every later beat.
      show(OPENING_HIDDEN_LAYERS, REVEAL_SEC),
    ]),
  ],
};

export const youAreHereEarthDwell: ClipData = {
  start: 'live',
  timeline: [
    // Re-pivot on Earth's centre down the eye's own sightline, so the eye stays
    // put and the drift circles the planet, not Copenhagen. Here, not in the
    // enter clip: that one resolves ids before its clock snap moves Earth.
    all([
      moveTargetId(EARTH, 0),
      dollyTo((EARTH_DATUM_RADIUS_M + WHOLE_EARTH_HEIGHT_M) * SCALE_UNITS.M_TO_MPC, 0),
    ]),
    ...dwellDrift(DWELL_SEC).timeline,
  ],
};
