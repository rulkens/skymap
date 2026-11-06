/**
 * You are here — the rise from the park to the whole Earth, one clip in three
 * frame legs. `{ sky }`: from beat 00's night view the eye starts turning down.
 * `{ body }`: it lifts off before the turn ends, orbiting up over the ground it
 * was looking at until it looks straight down, then climbs: Copenhagen, Denmark,
 * the curve of the planet. World: the last of the pull-back, Earth focused and
 * named. Each leg starts from the pose the last one left, and both handovers
 * happen in motion, at matched speeds.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import {
  all,
  dollyTo,
  focus,
  moveTargetId,
  scene,
  seq,
  show,
  tween,
} from '../../../../services/engine/animation/effectHelpers';
import { BODY_FOCUS_PREFIX } from '../../../../services/url/bodyFocusId';
import { clockTo } from '../../../../state/tour/clockTo';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { focusId } from '../../../../utils/animation/focusId';
import { orbitAnglesLookingAlong } from '../../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { skySpotRadial } from '../../../../utils/geo/skySpotRadial';
import { EARTH_DATUM_RADIUS_M } from '../../../bodies/earthDatumRadiusM';
import { SCALE_UNITS } from '../../../scaleUnits';
import { OPENING_HIDDEN_LAYERS } from './openingHiddenLayers';
import { PARK_VIEW } from './parkView';
import { SONDERMARKEN_SPOT } from './sondermarkenSpot';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const SKY: PoseFrame = { sky: SONDERMARKEN_SPOT };
const HOST: PoseFrame = { body: SONDERMARKEN_SPOT.body };
const EARTH = focusId(`${BODY_FOCUS_PREFIX}${SONDERMARKEN_SPOT.body}`);

// The body arm's angles for looking straight down at the park. Body channels
// are the orbit convention in the host's fixed axes, so the arm IS the radial.
const UP = skySpotRadial(SONDERMARKEN_SPOT);
const NADIR_ARM = orbitAnglesLookingAlong([-UP[0], -UP[1], -UP[2]]);

// Due north, 23° down: the body leg's target lands where this sightline meets
// the datum, ~80 m ahead, and the eye orbits up over it. North matters: there
// the horizon-level and pole-level screen-ups coincide, and a body leg has no
// roll channel, so any other azimuth would snap as a roll at the handover.
const HANDOVER_ALTITUDE_RAD = -0.4;

// Turn speeds match at the handover: the sky turn ends at speed (easeInSine),
// the body turn starts at it (easeOutSine), each ∝ its angle over its time.
// The eye itself starts at turn rate × that ~80 m (~45 m/s): a body arm turns
// about its target, never the eye. Steeper or slower here softens it.
const TURN_SKY_SEC = 5;
const TURN_BODY_SEC = 3.2;
// The climb, in log distance: lift-off accelerates (easeInSine) into a constant
// ~1.3 per second (linear), so Copenhagen stays on screen for seconds; the
// world dolly opens at that speed (easeOutSine) and settles on the whole Earth.
const LIFT_SEC = 3.8;
const CLIMB_SEC = 5;
const PULL_BACK_SEC = 2.8;
const REVEAL_SEC = 2;
const DWELL_SEC = 7;

const LIFT_TOP_M = 3_000;
// Where the body leg hands over: Denmark small, the planet's curve at the edge.
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
    all([
      tween('yaw', { to: 0, over: TURN_SKY_SEC, ease: 'easeInOutSine', frame: SKY }),
      tween('pitch', {
        to: HANDOVER_ALTITUDE_RAD,
        over: TURN_SKY_SEC,
        ease: 'easeInSine',
        frame: SKY,
      }),
    ]),
    all([
      tween('yaw', { to: NADIR_ARM.yaw, over: TURN_BODY_SEC, ease: 'easeOutSine', frame: HOST }),
      tween('pitch', {
        to: NADIR_ARM.pitch,
        over: TURN_BODY_SEC,
        ease: 'easeOutSine',
        frame: HOST,
      }),
      seq([
        tween('distance', { to: LIFT_TOP_M, over: LIFT_SEC, ease: 'easeInSine', frame: HOST }),
        tween('distance', { to: RISE_TOP_M, over: CLIMB_SEC, ease: 'linear', frame: HOST }),
      ]),
    ]),
    all([
      focus(EARTH),
      dollyTo(WHOLE_EARTH_HEIGHT_M * SCALE_UNITS.M_TO_MPC, PULL_BACK_SEC, 'easeOutSine'),
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
