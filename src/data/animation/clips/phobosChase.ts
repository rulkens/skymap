/**
 * phobosChase — one whole orbit of Phobos (7 h 39 min) in 18 seconds, the
 * camera riding along beside it with Mars always behind: the moon holds still
 * in frame while the planet turns and daylight, then night, sweep across it.
 *
 * Uses the `clock` cue with `trackBody`'s chase mode; both read the same keys,
 * so the target and the bearing land on Phobos at the instant the clock shows.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { ClockKey } from '../../../@types/animation/ClockKey';
import type { Vec3 } from '../../../@types/math/Vec3';
import { all, clock, hide, hold } from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCALE_UNITS } from '../../scaleUnits';
import { trackBody } from './makers/trackBody';

const PHOBOS_PERIOD_DAYS = 0.31891;
const ELEVATION_RAD = 0.3;
const KM = SCALE_UNITS.KM_TO_MPC;

export function phobosChase(simDays: number): Clip {
  const keys: ClockKey[] = [
    { sec: 0, simDays },
    { sec: 1.5, simDays },
    { sec: 19.5, simDays: simDays + PHOBOS_PERIOD_DAYS },
  ];
  const bodies = deriveBodyStates(simDays);
  const p = bodies.get('phobos')!.positionMpc;
  const m = bodies.get('mars')!.positionMpc;
  const bearing = orbitAnglesLookingAlong(
    normalize3([m[0] - p[0], m[1] - p[1], m[2] - p[2]]),
    ORIENTATION_FRAMES.ecliptic,
  );
  const target: Vec3 = [p[0], p[1], p[2]];
  return {
    id: 'phobosChase',
    label: 'Phobos, one orbit',
    data: {
      start: {
        target,
        distance: 70 * KM,
        yaw: bearing.yaw,
        pitch: bearing.pitch + ELEVATION_RAD,
      },
      timeline: [
        // Nothing but the moon and the planet: the turning light is the subject.
        hide(['labels', 'orbitTrails', 'missionTrails', 'structureRing'], 0),
        clock(keys),
        all([trackBody('phobos', keys, 0.25, { bodyId: 'mars', elevationRad: ELEVATION_RAD })]),
        hold(2),
      ],
    },
  };
}
