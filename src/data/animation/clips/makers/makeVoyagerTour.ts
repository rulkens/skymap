/**
 * makeVoyagerTour — both Voyagers from launch to the clip's own start instant,
 * seen from a fixed bearing over the Sun while their trails grow. The clock cue
 * jumps to launch itself, so the clip plays the same from any boot instant.
 *
 * The clock runs fast through the planetary years and faster still after
 * Neptune, and the dolly widens with the craft: 12 years to cross 30 AU, then
 * 37 years to reach ~165 AU.
 */

import type { Clip } from '../../../../@types/animation/Clip';
import type { ClipId } from '../../../../@types/animation/ClipId';
import type { Vec3 } from '../../../../@types/math/Vec3';
import {
  all,
  clock,
  dollyTo,
  hide,
  hold,
  seq,
  show,
  spin,
  wait,
} from '../../../../services/engine/animation/effectHelpers';
import { frameUp } from '../../../../utils/camera/frameUp';
import { normalize3 } from '../../../../utils/math/normalize3';
import { orbitAnglesLookingAlong } from '../../../../utils/camera/orbitAnglesLookingAlong';
import { unixMsToJulianDays } from '../../../../utils/time/unixMsToJulianDays';
import { ORIENTATION_FRAMES } from '../../../orientation/orientationFrames';
import { MISSION_EVENTS } from '../../../missions/missionEvents.generated';
import { SCALE_UNITS } from '../../../scaleUnits';

const eventJd = (id: string) =>
  unixMsToJulianDays(Date.parse(MISSION_EVENTS.find((e) => e.id === id)!.iso));

const LAUNCH_JD = eventJd('voyager2-launch');
const NEPTUNE_JD = eventJd('voyager2-neptune');

const LEAD_IN_SEC = 1.5; // launch, held: the first frame shows the planets at rest
const PLANETS_SEC = 14;
const OUTBOUND_SEC = 8;
const END_HOLD_SEC = 3;

const AU = SCALE_UNITS.AU_TO_MPC;

export function makeVoyagerTour(opts: {
  id: ClipId;
  label: string;
  elevationRad: number; // camera height over the ecliptic
  spinRad: number; // total yaw drift across the clip
  hideStars?: boolean; // a clean diagram: orbits and trails on black
}): (simDays: number) => Clip {
  return function build(simDays: number): Clip {
    const north = frameUp(ORIENTATION_FRAMES.ecliptic);
    const across = normalize3([north[1], -north[0], 0]); // any in-plane direction
    const c = Math.cos(opts.elevationRad);
    const s = Math.sin(opts.elevationRad);
    const forward: Vec3 = normalize3([
      c * across[0] - s * north[0],
      c * across[1] - s * north[1],
      c * across[2] - s * north[2],
    ]);
    const total = LEAD_IN_SEC + PLANETS_SEC + OUTBOUND_SEC + END_HOLD_SEC;
    return {
      id: opts.id,
      label: opts.label,
      data: {
        start: {
          target: [0, 0, 0],
          distance: 22 * AU,
          ...orbitAnglesLookingAlong(forward, ORIENTATION_FRAMES.ecliptic),
        },
        timeline: [
          hide(
            [
              'survey',
              'labels',
              'structureRing',
              'cosmicWebDensity',
              'zoneOfAvoidance',
              ...(opts.hideStars ? (['starCatalog', 'milkyWayDisk'] as const) : []),
            ],
            0,
          ),
          show(['missionTrails', 'orbitTrails', 'label:missions', 'label:body'], 0),
          clock([
            { sec: 0, simDays: LAUNCH_JD },
            { sec: LEAD_IN_SEC, simDays: LAUNCH_JD },
            { sec: LEAD_IN_SEC + PLANETS_SEC, simDays: NEPTUNE_JD + 60 },
            {
              sec: LEAD_IN_SEC + PLANETS_SEC + OUTBOUND_SEC,
              simDays: Math.max(simDays, NEPTUNE_JD + 61),
            },
          ]),
          all([
            seq([
              wait(LEAD_IN_SEC),
              dollyTo(70 * AU, PLANETS_SEC, 'easeInOutSine'),
              dollyTo(380 * AU, OUTBOUND_SEC, 'easeInOutSine'),
              hold(END_HOLD_SEC),
            ]),
            spin('yaw', { by: opts.spinRad, over: total, ease: 'linear' }),
          ]),
        ],
      },
    };
  };
}
