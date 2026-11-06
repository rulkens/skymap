/**
 * The Long Way Out — the tour opens standing in Søndermarken at noon, looking
 * south down the lawn with the Sun in frame; the clock then runs to night while
 * the view turns west with the Sun, holds it as it sets, and tilts up to the
 * Milky Way. The enter clip is all snaps, so the cold-load gate waits on a still
 * frame; the dwell carries the motion under the caption.
 *
 * Every camera write is tagged `{ sky }` (yaw = azimuth, pitch = altitude) so the
 * eye rides the park while Earth turns; authored tweens, not `dwellDrift`, since
 * a frame-tagged writer may not overlap a composite window on the same channel.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import {
  all,
  focus,
  frameTo,
  hide,
  hold,
  scene,
  seq,
  tween,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { setLabelsFocusedOnly } from '../../../../state/settings/core/labelsSlice';
import { clockTo } from '../../../../state/tour/clockTo';
import { skyPoseOfBodyAt } from '../../../../utils/geo/skyPoseOfBodyAt';
import { wrapRad } from '../../../../utils/math/wrapRad';
import { OPENING_HIDDEN_LABELS } from './openingHiddenLabels';
import { OPENING_HIDDEN_LAYERS } from './openingHiddenLayers';
import { PARK_VIEW } from './parkView';
import { SONDERMARKEN_SPOT } from './sondermarkenSpot';
import { TOUR_NOON_SIM_DAYS } from './tourNoonSimDays';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';
import { TOUR_SUNSET_SIM_DAYS } from './tourSunsetSimDays';

const SKY: PoseFrame = { sky: SONDERMARKEN_SPOT };

// Up past the treetops at the noon Sun; at sunset low enough to keep the setting
// Sun in frame, high enough that the ground, blank at dusk, stays a thin strip.
const OPEN_ALTITUDE_RAD = 0.5;
const SUNSET_ALTITUDE_RAD = 0.35;

const TITLE_SEC = 4;
const NIGHTFALL_SEC = 22;
const NIGHT_HOLD_SEC = 1.5;

// The clock runs ~1,700× here, so the sky wheels ~7°/s about the pole: it holds
// that rate, then comes to rest over the last CLOCK_EASE_SEC. easeOutQuad starts
// at twice its average rate, so handed half a full-rate stretch of days it takes
// over the linear leg's rate without a seam and slows it linearly to zero. One
// ease across all of NIGHTFALL_SEC would start slowing from the first second.
const CLOCK_EASE_SEC = 4;
const CLOCK_LINEAR_SEC = NIGHTFALL_SEC - CLOCK_EASE_SEC;
const NIGHTFALL_DAYS = TOUR_NIGHT_SIM_DAYS - TOUR_NOON_SIM_DAYS;
const FULL_RATE = NIGHTFALL_DAYS / (NIGHTFALL_SEC - CLOCK_EASE_SEC / 2);
const EASE_FROM_SIM_DAYS = TOUR_NIGHT_SIM_DAYS - (FULL_RATE * CLOCK_EASE_SEC) / 2;
const SUNSET_SEC = (TOUR_SUNSET_SIM_DAYS - TOUR_NOON_SIM_DAYS) / FULL_RATE;

// The pan is linear in sim time, so it shares the clock's profile and the frame
// comes to rest with the sky. Yaw tweens take the shorter arc, so azimuths are
// unwrapped westward from the noon Sun and every leg stays under half a turn.
const NOON_SUN = skyPoseOfBodyAt('sun', SONDERMARKEN_SPOT, TOUR_NOON_SIM_DAYS);
const SUNSET_AZIMUTH_RAD =
  NOON_SUN.azimuthRad +
  wrapRad(
    skyPoseOfBodyAt('sun', SONDERMARKEN_SPOT, TOUR_SUNSET_SIM_DAYS).azimuthRad -
      NOON_SUN.azimuthRad,
  );
const PAN_TO_RAD = SUNSET_AZIMUTH_RAD + wrapRad(PARK_VIEW.azimuthRad - SUNSET_AZIMUTH_RAD);
// Started as far right of the noon Sun as it ends left of the setting one: with
// f the sunset's share of the run, noon − from = from + (to − from)·f − sunset.
const SUNSET_SHARE = (TOUR_SUNSET_SIM_DAYS - TOUR_NOON_SIM_DAYS) / NIGHTFALL_DAYS;
const PAN_FROM_RAD =
  (NOON_SUN.azimuthRad + SUNSET_AZIMUTH_RAD - SUNSET_SHARE * PAN_TO_RAD) / (2 - SUNSET_SHARE);
const panAt = (simDays: number) =>
  PAN_FROM_RAD + ((PAN_TO_RAD - PAN_FROM_RAD) * (simDays - TOUR_NOON_SIM_DAYS)) / NIGHTFALL_DAYS;

const NIGHTFALL_CLOCK = seq([
  scene(clockTo({ simDays: EASE_FROM_SIM_DAYS, overSec: CLOCK_LINEAR_SEC })),
  wait(CLOCK_LINEAR_SEC),
  scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: CLOCK_EASE_SEC, ease: 'easeOutQuad' })),
  wait(CLOCK_EASE_SEC),
]);

const NIGHTFALL_PAN = seq([
  tween('yaw', { to: panAt(TOUR_SUNSET_SIM_DAYS), over: SUNSET_SEC, ease: 'linear', frame: SKY }),
  tween('yaw', {
    to: panAt(EASE_FROM_SIM_DAYS),
    over: CLOCK_LINEAR_SEC - SUNSET_SEC,
    ease: 'linear',
    frame: SKY,
  }),
  tween('yaw', { to: PAN_TO_RAD, over: CLOCK_EASE_SEC, ease: 'easeOutQuad', frame: SKY }),
]);

// Down with the Sun to its setting, then up to the night sky, at rest between.
const NIGHTFALL_TILT = seq([
  tween('pitch', { to: SUNSET_ALTITUDE_RAD, over: SUNSET_SEC, ease: 'easeInOutSine', frame: SKY }),
  tween('pitch', {
    to: PARK_VIEW.nightAltitudeRad,
    over: NIGHTFALL_SEC - SUNSET_SEC,
    ease: 'easeInOutSine',
    frame: SKY,
  }),
]);

const STAND_AT_NOON = all([
  tween('yaw', { to: PAN_FROM_RAD, over: 0, frame: SKY }),
  tween('pitch', { to: OPEN_ALTITUDE_RAD, over: 0, frame: SKY }),
]);

export const parkOpening: ClipData = {
  start: 'live',
  timeline: [
    // Each layer is a later beat's reveal; the takeover's snapshot winds it back.
    hide(
      [
        'cosmicWebDensity',
        'cosmicWebFilaments', // hidden for the whole tour: the web beats show the volume
        'flow',
        'structureRing', // shown per category as beats reach them
        'label:milkyWay', // named by the Milky Way beat
        'survey', // catalogs revealed one at a time on the way out
        ...OPENING_HIDDEN_LAYERS, // beat 01 shows them again
        ...OPENING_HIDDEN_LABELS, // named by later beats
      ],
      0,
    ),
    // Only the focused subject is named for the whole tour; here nothing is.
    scene(setLabelsFocusedOnly(true)),
    focus(null),
    // The tour's pole until the M31 approach (docs/tour/implementation-notes.md);
    // a sky pose stands on the horizon, so the instant roll is unseen.
    frameTo('galactic', { over: 0 }),
    scene(clockTo({ simDays: TOUR_NOON_SIM_DAYS, overSec: 0 })),
    STAND_AT_NOON,
  ],
};

export const parkOpeningDwell: ClipData = {
  start: 'live',
  timeline: [
    // Re-stated so the dwell opens its sky leg at once, also when played alone.
    STAND_AT_NOON,
    wait(TITLE_SEC),
    all([NIGHTFALL_CLOCK, NIGHTFALL_PAN, NIGHTFALL_TILT]),
    hold(NIGHT_HOLD_SEC),
  ],
};
