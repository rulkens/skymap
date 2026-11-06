/**
 * You are here — the rise from the park to the whole Earth, one clip in three
 * frame legs. `{ sky }`: a short look down from beat 00's zenith view, to rest.
 * `{ body }`: the eye swings up and back over the lawn as the view keeps
 * turning down, the climb takes over once the view is level, and the turn ends
 * straight down over Copenhagen, Denmark, the curve of the planet. World: the
 * last of the pull-back, Earth focused. Each leg starts from the pose the last
 * one left; the turn rests at the sky → body handover so the eye's speed stays
 * continuous (a body arm turns about its target, not the eye).
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { Ease } from '../../../../@types/animation/Ease';
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

// Due north, below the celestial pole (55.7° up here): a body leg has no roll
// channel and levels screen-up on the pole, which matches the sky arm's level
// horizon only looking north under the pole. The ray misses the ground, so the
// body target lands as far ahead as the eye stands above the datum (~35 m, the
// floor in `toWorldArm`), and the arm swings the eye up and back over it.
const HANDOVER_ALTITUDE_RAD = 0.9;
const TURN_SKY_SEC = 2;

// The body turn's view altitudes. Body yaw/pitch are the Y-up orbit angles in
// the host's fixed axes, whose lerp leaves the meridian (a ~4° horizon roll in
// one tween), so the turn steps along the meridian: eased in, linear at
// TURN_RATE, eased out, every join at the same rate.
const LEVEL_STOPS = [HANDOVER_ALTITUDE_RAD, HANDOVER_ALTITUDE_RAD / 2, 0] as const;
const DOWN_STOPS = [0, -0.5, -1, -Math.PI / 2] as const;
const TURN_RATE = 0.2;

// Looking north at `altitudeRad` is the radial of the latitude π/2 − alt further on.
const meridianArm = (altitudeRad: number) =>
  orbitAnglesLookingAlong(
    skySpotRadial({
      ...SONDERMARKEN_SPOT,
      latRad: SONDERMARKEN_SPOT.latRad + Math.PI / 2 - altitudeRad,
    }),
  );

const turnBetween = (stops: readonly number[], firstEase: Ease, lastEase: Ease) =>
  seq(
    stops.slice(1).map((to, i) => {
      const ease = i === 0 ? firstEase : i === stops.length - 2 ? lastEase : 'linear';
      // An eased end's peak slope is π/2, so it runs that much longer to meet the rate.
      const over = (Math.abs(to - stops[i]!) * (ease === 'linear' ? 1 : Math.PI / 2)) / TURN_RATE;
      const arm = meridianArm(to);
      return all([
        tween('yaw', { to: arm.yaw, over, ease, frame: HOST }),
        tween('pitch', { to: arm.pitch, over, ease, frame: HOST }),
      ]);
    }),
  );

// The climb, in log distance, starts at rest once the view is level: before
// that the arm points down behind the target and a longer one lowers the eye.
// Lift-off accelerates (easeInQuad, end slope 2) into a constant ~1.3 per
// second (linear), so Copenhagen stays on screen for seconds; the world dolly
// opens at that speed (easeOutSine) and settles on the whole Earth.
const LIFT_SEC = 7;
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
        ease: 'easeInOutSine',
        frame: SKY,
      }),
    ]),
    turnBetween(LEVEL_STOPS, 'easeInSine', 'linear'),
    all([
      turnBetween(DOWN_STOPS, 'linear', 'easeOutSine'),
      seq([
        tween('distance', { to: LIFT_TOP_M, over: LIFT_SEC, ease: 'easeInQuad', frame: HOST }),
        tween('distance', { to: RISE_TOP_M, over: CLIMB_SEC, ease: 'linear', frame: HOST }),
      ]),
    ]),
    all([
      focus(EARTH),
      dollyTo(WHOLE_EARTH_HEIGHT_M * SCALE_UNITS.M_TO_MPC, PULL_BACK_SEC, 'easeOutSine'),
      // Beat 00 hid these over the park; its labels stay hidden for later beats.
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
