/**
 * The Long Way Out — the tour opens standing in Søndermarken at noon, then looks
 * up while the clock runs to night. The enter clip is all snaps: it strips the
 * scene, sets the pole, the date and the standing view, so the cold-load gate
 * waits on a still frame. The dwell carries the motion under the caption.
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
  tween,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { setLabelsFocusedOnly } from '../../../../state/settings/core/labelsSlice';
import { clockTo } from '../../../../state/tour/clockTo';
import { OPENING_HIDDEN_LABELS } from './openingHiddenLabels';
import { OPENING_HIDDEN_LAYERS } from './openingHiddenLayers';
import { PARK_VIEW } from './parkView';
import { SONDERMARKEN_SPOT } from './sondermarkenSpot';
import { TOUR_NOON_SIM_DAYS } from './tourNoonSimDays';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const SKY: PoseFrame = { sky: SONDERMARKEN_SPOT };

const OPEN_ALTITUDE_RAD = 0.35;

const TITLE_SEC = 4;
const NIGHTFALL_SEC = 22;
const NIGHT_HOLD_SEC = 4;

const standAt = (altitudeRad: number) =>
  all([
    tween('yaw', { to: PARK_VIEW.azimuthRad, over: 0, frame: SKY }),
    tween('pitch', { to: altitudeRad, over: 0, frame: SKY }),
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
    standAt(OPEN_ALTITUDE_RAD),
  ],
};

export const parkOpeningDwell: ClipData = {
  start: 'live',
  timeline: [
    // Re-stated so the dwell opens its sky leg at once, also when played alone.
    standAt(OPEN_ALTITUDE_RAD),
    wait(TITLE_SEC),
    all([
      scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec: NIGHTFALL_SEC })),
      tween('pitch', { to: PARK_VIEW.nightAltitudeRad, over: NIGHTFALL_SEC, frame: SKY }),
    ]),
    hold(NIGHT_HOLD_SEC),
  ],
};
