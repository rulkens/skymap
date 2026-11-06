/**
 * You are here — the Milky Way, approached from far out on its disc bearing.
 * The snap is zero-duration cues on separate channels (target, distance,
 * yaw/pitch, roll), so one `all` is legal; `aimAlong` takes a fixed WORLD sightline,
 * not a `lookAtId` bearing, so every run lands the same view whatever pose the
 * previous beat left. At 100 Mpc the sprite is sub-pixel, so home materialises
 * as the log dolly closes in. The label reveal follows the focus: under the
 * tour's focusedOnly mode it is the second of the two gates.
 *
 * The dwell drifts and pushes in: the dolly writes `distance` while the drift
 * writes yaw/pitch, so the single-writer rule holds.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  aimAlong,
  all,
  dollyTo,
  focusOnId,
  frameTo,
  moveTargetId,
  show,
  tween,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { GALACTIC_DISC_FORWARD } from '../../../../services/engine/camera/framing/cameraFraming';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { OPENING_HIDDEN_LABELS } from './openingHiddenLabels';

const MW = focusId('milkyWay');

// Far enough that the Milky-Way sprite (~0.03 Mpc across) is sub-pixel.
const FAR_OPEN_MPC = 100;

export const youAreHere: ClipData = {
  start: 'live',
  timeline: [
    // The pole and the roll are stated on entry, like the snap: the Earth beats
    // before run under the ecliptic, and a skip from the rise lands rolled.
    frameTo('galactic', { over: 0 }),
    all([
      moveTargetId(MW, 0),
      dollyTo(FAR_OPEN_MPC, 0),
      aimAlong(GALACTIC_DISC_FORWARD, 0),
      tween('roll', { to: 0, over: 0 }),
    ]),
    // Placeholder: the beats between Earth and here are to claim these.
    show([...OPENING_HIDDEN_LABELS, 'missionTrails'], 0),
    focusOnId(MW, 7),
    show(['label:milkyWay'], 1),
  ],
};

export const youAreHereDwell: ClipData = {
  start: 'live',
  timeline: [all([...dwellDrift(7).timeline, dollyTo(0.08, 4)])],
};
