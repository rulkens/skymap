/**
 * powersOfTenEames — the Eameses' grammar, not just their subject: straight
 * down onto the park from the first frame, north up, and one dolly at a
 * constant rate in log space, so every power of ten takes the same 2.2 s.
 *
 * `linear` easing on a log-space dolly IS the constant-rate zoom; any other
 * ease would make the middle decades rush and the ends crawl.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  aimAlong,
  all,
  dollyTo,
  hide,
  hold,
  tween,
} from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { linkedPoseToWorld } from '../../../services/engine/camera/arms/utils/linkedPoseToWorld';
import { normalize3 } from '../../../utils/math/normalize3';
import { northUpRoll } from '../../../utils/camera/orbitPose/northUpRoll';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCENE_EARTH } from '../../bodies/sceneEarth';
import { SCALE_UNITS } from '../../scaleUnits';
import { SONDERMARKEN_POSE } from './sondermarkenFlyout';

const START_M = 60; // a stretch of the park; lower, the first frames wait on terrain tiles
const HORIZON_MPC = 29_500;
const SEC_PER_DECADE = 2.2;

export function powersOfTenEames(simDays: number): Clip {
  const basis = ORIENTATION_FRAMES.ecliptic;
  const park = linkedPoseToWorld(SONDERMARKEN_POSE, simDays, basis).target;
  const earthState = deriveBodyStates(simDays).get(SCENE_EARTH.id)!;
  const earth = earthState.positionMpc;
  const up = normalize3([park[0] - earth[0], park[1] - earth[1], park[2] - earth[2]]);
  const nadir: Vec3 = [-up[0], -up[1], -up[2]];
  const startMpc = START_M * SCALE_UNITS.M_TO_MPC;
  const decades = Math.log10(HORIZON_MPC / startMpc);
  return {
    id: 'powersOfTenEames',
    label: 'Powers of Ten (Eames)',
    data: {
      start: { target: [park[0], park[1], park[2]], distance: startMpc, yaw: 0, pitch: 0 },
      timeline: [
        // The film has no labels or guides; the rhythm is the narration.
        hide(['labels', 'structureRing', 'zoneOfAvoidance', 'orbitTrails', 'missionTrails'], 0),
        all([
          aimAlong(nadir, 0),
          tween('roll', { to: northUpRoll(nadir, earthState.orientation, basis), over: 0 }),
        ]),
        hold(3),
        dollyTo(HORIZON_MPC, decades * SEC_PER_DECADE, 'linear'),
        hold(3),
      ],
    },
  };
}
