/**
 * phobosApproach — Mars fills the frame with Phobos a speck in front of it,
 * then a log push in until the moon's shape model fills the frame, Mars still
 * behind it: the payoff (the potato) lands last.
 *
 * The bearing splits the difference between the sunlight direction and the
 * line to Mars, so both the planet and the moon's near face are lit.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  all,
  dollyTo,
  hide,
  hold,
  seq,
  show,
  spin,
  wait,
} from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCALE_UNITS } from '../../scaleUnits';

const KM = SCALE_UNITS.KM_TO_MPC;
const PUSH_SEC = 16;

export function phobosApproach(simDays: number): Clip {
  const bodies = deriveBodyStates(simDays);
  const p = bodies.get('phobos')!.positionMpc;
  const m = bodies.get('mars')!.positionMpc;
  const toMars = normalize3([m[0] - p[0], m[1] - p[1], m[2] - p[2]]);
  const sunlight = normalize3([p[0], p[1], p[2]]); // the Sun sits at the origin
  const forward = normalize3([
    toMars[0] + sunlight[0],
    toMars[1] + sunlight[1],
    toMars[2] + sunlight[2],
  ]);
  const target: Vec3 = [p[0], p[1], p[2]];
  return {
    id: 'phobosApproach',
    label: 'Phobos approach',
    data: {
      start: {
        target,
        distance: 30_000 * KM,
        ...orbitAnglesLookingAlong(forward, ORIENTATION_FRAMES.ecliptic),
      },
      timeline: [
        hide(['labels', 'missionTrails', 'structureRing'], 0),
        show(['label:body'], 0),
        hold(1.5),
        all([
          dollyTo(48 * KM, PUSH_SEC, 'easeInOutSine'),
          spin('yaw', { by: 0.35, over: PUSH_SEC + 4, ease: 'easeOutCubic' }),
          // The moons' orbits set the scene wide, then clear the close-up.
          seq([wait(7), hide(['orbitTrails', 'label:body'], 2)]),
        ]),
        hold(3),
      ],
    },
  };
}
