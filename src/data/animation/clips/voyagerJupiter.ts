/**
 * voyagerJupiter — Voyager 2's Jupiter flyby in July 1979, slowed to a crawl
 * at closest approach, with the camera riding along with Jupiter so the
 * craft's trail visibly bends around the planet: the gravity assist itself.
 *
 * Tracks Jupiter, not the craft: spacecraft tracks load at run time, so a clip
 * factory can't read Voyager's position, while planets are analytic.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { ClockKey } from '../../../@types/animation/ClockKey';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  all,
  clock,
  dollyTo,
  hide,
  hold,
  seq,
  show,
  spin,
} from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { unixMsToJulianDays } from '../../../utils/time/unixMsToJulianDays';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { frameUp } from '../../../utils/camera/frameUp';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { MISSION_EVENTS } from '../../missions/missionEvents.generated';
import { SCALE_UNITS } from '../../scaleUnits';
import { trackBody } from './makers/trackBody';

const FLYBY_JD = unixMsToJulianDays(
  Date.parse(MISSION_EVENTS.find((e) => e.id === 'voyager2-jupiter')!.iso),
);
// Eight days either side; a quarter day per second through the closest two.
const KEYS: ClockKey[] = [
  { sec: 0, simDays: FLYBY_JD - 8 },
  { sec: 1.5, simDays: FLYBY_JD - 8 },
  { sec: 8.5, simDays: FLYBY_JD - 1 },
  { sec: 16.5, simDays: FLYBY_JD + 1 },
  { sec: 23.5, simDays: FLYBY_JD + 8 },
];
const KM = SCALE_UNITS.KM_TO_MPC;
const ELEVATION_RAD = 0.6;

// The flyby instant is fixed, and the clock cue jumps to it, so the start instant is unused.
export function voyagerJupiter(): Clip {
  const jupiter = deriveBodyStates(KEYS[0]!.simDays).get('jupiter')!.positionMpc;
  const target: Vec3 = [jupiter[0], jupiter[1], jupiter[2]];
  const north = frameUp(ORIENTATION_FRAMES.ecliptic);
  // Looking sunward so the dayside faces the camera, from above the plane.
  const sunward = normalize3([-target[0], -target[1], -target[2]]);
  const c = Math.cos(ELEVATION_RAD);
  const s = Math.sin(ELEVATION_RAD);
  const forward = normalize3([
    c * sunward[0] - s * north[0],
    c * sunward[1] - s * north[1],
    c * sunward[2] - s * north[2],
  ]);
  return {
    id: 'voyagerJupiter',
    label: 'Voyager 2 at Jupiter',
    data: {
      start: {
        target,
        distance: 9e6 * KM,
        ...orbitAnglesLookingAlong(forward, ORIENTATION_FRAMES.ecliptic),
      },
      timeline: [
        hide(['survey', 'labels', 'structureRing', 'cosmicWebDensity', 'zoneOfAvoidance'], 0),
        show(['missionTrails', 'orbitTrails', 'label:missions', 'label:body'], 0),
        clock(KEYS),
        all([
          trackBody('jupiter', KEYS, 0.25),
          seq([dollyTo(3.8e6 * KM, 15, 'easeInOutSine'), dollyTo(7e6 * KM, 8.5, 'easeInOutSine')]),
          spin('yaw', { by: 0.5, over: 23.5, ease: 'linear' }),
        ]),
        hold(2.5),
      ],
    },
  };
}
