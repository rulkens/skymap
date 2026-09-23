/**
 * sondermarkenFlyout — "Søndermarken to the Edge": the Powers of Ten shot.
 * Open on a near-level view across the park, pull straight back to the
 * observable horizon in one log-space dolly, and tilt down to the nadir on
 * the way up.
 *
 * The orbit target is where the opening sightline meets the ground, so the
 * tilt swings the eye up over what the shot is looking at and `distance` is
 * the range to it; aimed at Earth's centre, a log dolly would clear the first
 * 4000 km of altitude in about a second.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { aimAlong, all, dollyTo, hold, seq, wait } from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { linkedPoseToWorld } from '../../../utils/camera/linkedPoseToWorld';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCENE_EARTH } from '../../bodies/sceneEarth';

// Eye-tuned: a few seconds on the opening view, ~24 decades at earthFlyout's
// pace, the tilt done by ~10 km up, and a beat at the horizon before the end.
const LEAD_IN_SEC = 3;
const FLIGHT_SEC = 90;
const TILT_SEC = 20;
const END_HOLD_SEC = 4;
const HORIZON_MPC = 29_500;

/** The opening view, as the app's `#pose=` link value (46 m up, looking north). */
export const SONDERMARKEN_POSE =
  'b,earth,0,0,0,3507565.0909855557,779181.3743209324,5261187.663255859,-0.0469557302440652,0.9921810373246189,-0.1156371418303389,0.5013233500514287,0.12353707964967056,0.8563956379179216,-0.8639849871904368,0.01775891677648963,0.503204295276249';

/**
 * Build the clip at the frozen clip-start instant `simDays`: the opening pose
 * is body-fixed, so the world pose and the nadir both turn with Earth.
 */
export function sondermarkenFlyout(simDays: number): Clip {
  const start = linkedPoseToWorld(SONDERMARKEN_POSE, simDays, ORIENTATION_FRAMES.ecliptic);
  const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!.positionMpc;
  const up = normalize3([
    start.target[0] - earth[0],
    start.target[1] - earth[1],
    start.target[2] - earth[2],
  ]);
  const nadir: Vec3 = [-up[0], -up[1], -up[2]];

  return {
    id: 'sondermarkenFlyout',
    label: 'Søndermarken to the Edge',
    data: {
      start: { target: start.target, distance: start.distance, yaw: start.yaw, pitch: start.pitch },
      timeline: [
        seq([
          wait(LEAD_IN_SEC),
          all([
            dollyTo(HORIZON_MPC, FLIGHT_SEC, 'easeInOutCubic'),
            aimAlong(nadir, TILT_SEC, 'easeInOutCubic'),
          ]),
          hold(END_HOLD_SEC),
        ]),
      ],
    },
  };
}
