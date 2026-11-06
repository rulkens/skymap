/**
 * The Milky Way — one log pull-out from beat 04's view near Alpha Centauri to
 * the whole galaxy. The Gaia star field thins out as the Milky Way's disc fades
 * in around it (`milkyWayDisk`'s `approachSun` band), so the handover is the
 * engine's, not a cut. The view swings to look down 35° onto the disc toward
 * the Galactic Centre while the range is still small; the target leaves the Sun
 * for the galaxy's centre only once the range is past ~10 kpc, or the Sun-side
 * view slides sideways. The star-map names go first: the field they crowd at
 * 100 light-years is the subject.
 *
 * The dwell drifts and pushes in: the dolly writes `distance` while the drift
 * writes yaw/pitch, so the single-writer rule holds.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  aimAlong,
  all,
  dollyTo,
  focus,
  frameTo,
  hide,
  moveTarget,
  moveTargetId,
  seq,
  show,
  tween,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { dwellDrift } from '../../../../state/tour/dwellDrift';
import { bodyPositionMpcAt } from '../../../../utils/exhibits/mission/bodyPositionMpcAt';
import { degToRad } from '../../../../utils/math/degToRad';
import { GAL_X_EQ, GAL_Z_EQ } from '../../../orientation/orientationFrames';
import { FRAME_ROLL_SEC } from './frameRollSec';
import { OPENING_HIDDEN_LABELS } from './openingHiddenLabels';
import { STELLAR_NEIGHBOURHOOD_VIEW } from './stellarNeighbourhoodView';
import { TOUR_NIGHT_SIM_DAYS } from './tourNightSimDays';

const MW = focusId('milkyWay');
const SUN_MPC = bodyPositionMpcAt('sun', TOUR_NIGHT_SIM_DAYS);

const DOWN_ONTO_DISC_RAD = degToRad(35);
const DISC_VIEW_FORWARD = [0, 1, 2].map(
  (i) => Math.cos(DOWN_ONTO_DISC_RAD) * GAL_X_EQ[i]! - Math.sin(DOWN_ONTO_DISC_RAD) * GAL_Z_EQ[i]!,
) as Vec3;
const WHOLE_GALAXY_MPC = 0.05;

const PULL_OUT_SEC = 16;
const NAMES_OUT_SEC = 2;
const TURN_START_SEC = 1;
const TURN_SEC = 6;
const TO_CENTRE_START_SEC = 12;
const REVEAL_SEC = 1;

export const youAreHere: ClipData = {
  start: 'live',
  timeline: [
    frameTo('galactic', { over: FRAME_ROLL_SEC }),
    // Beat 04's landed view, restated so a skip or Prev pulls out from the pair.
    all([
      moveTarget(STELLAR_NEIGHBOURHOOD_VIEW.targetMpc, 0),
      dollyTo(STELLAR_NEIGHBOURHOOD_VIEW.distanceMpc, 0),
    ]),
    all([
      hide(['label:starCatalog:famousStar'], NAMES_OUT_SEC),
      dollyTo(WHOLE_GALAXY_MPC, PULL_OUT_SEC, 'easeInOutSine'),
      tween('roll', { to: 0, over: PULL_OUT_SEC, ease: 'easeInOutSine' }),
      seq([wait(TURN_START_SEC), aimAlong(DISC_VIEW_FORWARD, TURN_SEC, 'easeInOutSine')]),
      seq([
        moveTarget(SUN_MPC, TO_CENTRE_START_SEC, 'easeInOutSine'),
        moveTargetId(MW, PULL_OUT_SEC - TO_CENTRE_START_SEC, 'easeInOutSine'),
      ]),
    ]),
    focus(MW),
    // Placeholder: the beats between Earth and here are to claim these.
    show([...OPENING_HIDDEN_LABELS, 'missionTrails'], 0),
    show(['label:milkyWay'], REVEAL_SEC),
  ],
};

export const youAreHereDwell: ClipData = {
  start: 'live',
  timeline: [all([...dwellDrift(7).timeline, dollyTo(0.08, 4)])],
};
