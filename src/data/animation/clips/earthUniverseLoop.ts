/**
 * earthUniverseLoop — forever-looping "Earth ⇄ Universe": open on Earth's
 * sunlit side, dolly out to the observable horizon, hold, dolly back, hold,
 * repeat — the ambient loop `earthFlyout` (its one-shot cousin) inspired.
 * `loop: true` (see `ClipData`) hands the repeat to `clipPlayer`; this file's
 * only job is to make the loop point invisible: identical start/end pose,
 * yaw offset by exactly one full turn.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { dollyTo, spin, all, seq, hold } from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCENE_EARTH } from '../../bodies/sceneEarth';
import { SCALE_UNITS } from '../../scaleUnits';

const FLIGHT_SEC = 70; // same pull-back window as earthFlyout
const HOLD_SEC = 4;
const TOTAL_SEC = FLIGHT_SEC * 2 + HOLD_SEC * 2; // 148 — the spin's exact loop period

const EARTH_RADIUS_MPC = SCENE_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC;
const START_DISTANCE_MPC = EARTH_RADIUS_MPC * 3;

// Lift out of the ecliptic. Aiming straight along the sunward direction puts
// the eye IN the plane every planetary orbit lies in, so the orbits collapse to
// edge-on lines for the whole first half of the pull-back. 30° reads them as
// ellipses without tilting far enough to lose the sunlit face.
const ELEVATION_RAD = (30 * Math.PI) / 180;

/**
 * Build the loop at `simDays` — same instant-dependent factory shape as
 * `earthFlyout` (see its header): Earth's position is a function of the
 * clock, and the clip player freezes `simDays` at clip start.
 */
export function earthUniverseLoop(simDays: number): Clip {
  const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!.positionMpc;
  const target: Vec3 = [earth[0], earth[1], earth[2]];

  // The Sun sits at the render origin (see earthHomePose), so `earth` itself
  // IS the sun→Earth direction once normalised — aiming along it looks at Earth's day side.
  const sMag = Math.hypot(earth[0], earth[1], earth[2]);
  const sunward: Vec3 = [earth[0] / sMag, earth[1] / sMag, earth[2] / sMag];

  // Encoded under the ecliptic basis — the default orientation, and the frame
  // earthFlyout's own literal yaw/pitch are tuned against. A clip factory only
  // ever sees `simDays`, never the live frame, so (like earthFlyout) this pose
  // is exactly sunlit under the default orientation only — an existing
  // limitation of the `(simDays) => Clip` factory shape, not a new one.
  const { yaw, pitch } = orbitAnglesLookingAlong(sunward, ORIENTATION_FRAMES.ecliptic);

  return {
    id: 'earthUniverseLoop',
    label: 'Earth ⇄ Universe (loop)',
    data: {
      start: { target, distance: START_DISTANCE_MPC, yaw, pitch: pitch + ELEVATION_RAD },
      loop: true,
      timeline: [
        all([
          seq([
            dollyTo(29_500, FLIGHT_SEC, 'easeInOutCubic'),
            hold(HOLD_SEC),
            dollyTo(START_DISTANCE_MPC, FLIGHT_SEC, 'easeInOutCubic'),
            hold(HOLD_SEC),
          ]),
          // Exactly one full turn over the WHOLE cycle: yaw(TOTAL_SEC) ===
          // yaw(0) + 2π, so the loop seam is bit-for-bit invisible (pinned by
          // the seamlessness test). Linear, not eased — a constant turn rate,
          // so nothing lurches at the seam.
          spin('yaw', { by: Math.PI * 2, over: TOTAL_SEC, ease: 'linear' }),
        ]),
      ],
    },
  };
}
