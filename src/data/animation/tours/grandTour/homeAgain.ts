/**
 * Home again — the return, and the tour's landing: one log dolly from the edge
 * of the observable universe down to the whole night-side Earth, then a
 * `{ body: 'earth' }` leg that sinks to Copenhagen, where beat 01's rise left
 * the ground behind. The rush comes in along Copenhagen's zenith, so the last
 * decades fall through the Milky Way's disc the viewer saw overhead from the
 * park. The landing is on Earth's arm: on the settle the tour ends, the clock
 * snaps back to the viewer's now, and the camera rides Earth there instead of
 * hanging where Earth stood on the tour date. No enter clip: the rush IS the
 * beat, and the caption rides it.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  aimAlong,
  all,
  dollyTo,
  focus,
  frameTo,
  moveTarget,
  scene,
  tween,
} from '../../../../services/engine/animation/effectHelpers';
import { BODY_FOCUS_PREFIX } from '../../../../services/url/bodyFocusId';
import { clockTo } from '../../../../state/tour/clockTo';
import { focusId } from '../../../../utils/animation/focusId';
import { northUpRoll } from '../../../../utils/camera/orbitPose/northUpRoll';
import { orbitAnglesLookingAlong } from '../../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { skySpotRadial } from '../../../../utils/geo/skySpotRadial';
import { rotateVec3ByTightMat3 } from '../../../../utils/math/rotateVec3ByTightMat3';
import { EARTH_DATUM_RADIUS_M } from '../../../bodies/earthDatumRadiusM';
import { orientationForBody } from '../../../bodies/orientationForBody';
import { ORIENTATION_FRAMES } from '../../../orientation/orientationFrames';
import { SCALE_UNITS } from '../../../scaleUnits';
import { DENMARK_VIEW_HEIGHT_M } from './denmarkViewHeightM';
import { FRAME_ROLL_SEC } from './frameRollSec';
import { SONDERMARKEN_SPOT } from './sondermarkenSpot';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';
import { WHOLE_EARTH_HEIGHT_M } from './wholeEarthHeightM';

const HOST: PoseFrame = { body: SONDERMARKEN_SPOT.body };
const EARTH = focusId(`${BODY_FOCUS_PREFIX}${SONDERMARKEN_SPOT.body}`);
const EARTH_MPC = bodyPositionMpcAt(SONDERMARKEN_SPOT.body, TOUR_NIGHT_SIM_DAYS);
const EARTH_ORIENTATION = orientationForBody(
  SONDERMARKEN_SPOT.body,
  TOUR_NIGHT_SIM_DAYS,
  new Map(),
);
const DOWN_LOCAL = skySpotRadial(SONDERMARKEN_SPOT).map((c) => -c) as Vec3;
const DOWN_WORLD = rotateVec3ByTightMat3(EARTH_ORIENTATION, DOWN_LOCAL);
const DOWN_HOST = orbitAnglesLookingAlong(DOWN_LOCAL);
// A body leg has no roll channel and levels north up, so the world leg arrives
// rolled north up: the handover then keeps the image.
const NORTH_UP_ROLL = northUpRoll(DOWN_WORLD, EARTH_ORIENTATION, ORIENTATION_FRAMES.galactic);

// ~19.5 decades of range, at most ~1.5 a second (easeInOutSine). The turn and
// the slide onto Earth finish while the range is still thousands of au, so the
// eye never swings past the Sun.
const RUSH_SEC = 20;
const TURN_SEC = 12;
const DESCENT_SEC = 7;

export const homeAgain: ClipData = {
  start: 'live',
  timeline: [
    scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: 0 })),
    // Galactic again, home again (docs/tour/implementation-notes.md): settled
    // within the first seconds of the rush, long before the tour-end restore.
    frameTo('galactic', { over: FRAME_ROLL_SEC }),
    focus(EARTH),
    all([
      dollyTo(
        (EARTH_DATUM_RADIUS_M + WHOLE_EARTH_HEIGHT_M) * SCALE_UNITS.M_TO_MPC,
        RUSH_SEC,
        'easeInOutSine',
      ),
      moveTarget(EARTH_MPC, TURN_SEC, 'easeInOutSine'),
      aimAlong(DOWN_WORLD, TURN_SEC, 'easeInOutSine'),
      tween('roll', { to: NORTH_UP_ROLL, over: TURN_SEC, ease: 'easeInOutSine' }),
    ]),
    // Beat 01's whole Earth, then down to where its rise handed over. The
    // target stays on Earth's centre, so the eye sinks straight down.
    all([
      tween('distance', {
        to: EARTH_DATUM_RADIUS_M + DENMARK_VIEW_HEIGHT_M,
        over: DESCENT_SEC,
        ease: 'easeInOutSine',
        frame: HOST,
      }),
      tween('yaw', { to: DOWN_HOST.yaw, over: DESCENT_SEC, frame: HOST }),
      tween('pitch', { to: DOWN_HOST.pitch, over: DESCENT_SEC, frame: HOST }),
    ]),
  ],
};
