/**
 * sondermarkenFlyout — "Søndermarken to the Edge": the Powers of Ten shot.
 * Open looking straight down on the park and pull straight back to the
 * observable horizon, one log-space dolly across ~24 decades.
 *
 * The orbit target is the park itself, not Earth's centre: `distance` is then
 * the altitude, so the log dolly is uniform in altitude from the first second.
 * Aimed at the centre, a log dolly measures from 6371 km away and clears the
 * first 4000 km of altitude in about a second. At cosmic scale the target's
 * offset from Earth's centre is invisible.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { dollyTo, hold, seq, wait } from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { surfacePointBodyFixed } from '../../../utils/geo/surfacePointBodyFixed';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { EARTH_PLACES } from '../../palette/earthPlaces';
import { SCENE_EARTH } from '../../bodies/sceneEarth';
import { SCALE_UNITS } from '../../scaleUnits';

// Eye-tuned: a few seconds on the park before lift-off, ~24 decades at
// earthFlyout's pace, and a beat at the horizon before the clip ends.
const LEAD_IN_SEC = 3;
const FLIGHT_SEC = 90;
const END_HOLD_SEC = 4;
const HORIZON_MPC = 29_500;

const SONDERMARKEN = findByIdOrThrow(EARTH_PLACES, 'sondermarken', 'sondermarkenFlyout');

/**
 * Build the clip at the frozen clip-start instant `simDays`: the park's world
 * position and its local vertical both turn with Earth, so both come from that
 * instant's body state.
 */
export function sondermarkenFlyout(simDays: number): Clip {
  const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!;
  const upLocal = surfacePointBodyFixed(SONDERMARKEN.latDeg, SONDERMARKEN.lonDeg, 1);
  const up = rotateVec3ByTightMat3(upLocal, earth.orientation);
  const groundMpc = SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;
  const target: Vec3 = [
    earth.positionMpc[0] + up[0] * groundMpc,
    earth.positionMpc[1] + up[1] * groundMpc,
    earth.positionMpc[2] + up[2] * groundMpc,
  ];
  // Looking along -up puts the eye on the up side of the target: straight down.
  const { yaw, pitch } = orbitAnglesLookingAlong(
    [-up[0], -up[1], -up[2]],
    ORIENTATION_FRAMES.ecliptic,
  );
  return {
    id: 'sondermarkenFlyout',
    label: 'Søndermarken to the Edge',
    data: {
      start: { target, distance: SONDERMARKEN.altKm * 1000 * SCALE_UNITS.M_TO_MPC, yaw, pitch },
      timeline: [
        seq([
          wait(LEAD_IN_SEC),
          dollyTo(HORIZON_MPC, FLIGHT_SEC, 'easeInOutCubic'),
          hold(END_HOLD_SEC),
        ]),
      ],
    },
  };
}
