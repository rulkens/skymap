/**
 * zoneOfAvoidancePullBack — cause first, then effect: open on the Milky Way
 * edge-on inside the Zone of Avoidance guide, then pull straight back along
 * the plane until the gap in the galaxy surveys opens out into a bow-tie with
 * us at its waist. The plane stays level (galactic pole) and the aim never
 * moves, so the only change on screen is scale.
 */

import type { Clip } from '../../../@types/animation/Clip';
import {
  aimAlong,
  dollyTo,
  frameTo,
  hide,
  hold,
  show,
} from '../../../services/engine/animation/effectHelpers';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { GALACTIC_EDGE_ON } from './makers/galacticSightlines';

export const zoneOfAvoidancePullBack: Clip = {
  id: 'zoneOfAvoidancePullBack',
  label: 'Zone of Avoidance pull-back',
  data: {
    start: {
      target: [0, 0, 0],
      distance: 0.06,
      ...orbitAnglesLookingAlong(GALACTIC_EDGE_ON, ORIENTATION_FRAMES.ecliptic),
    },
    timeline: [
      hide(['labels', 'structureRing', 'cosmicWebDensity'], 0),
      show(['label:milkyWay', 'label:zoneOfAvoidance'], 0),
      frameTo('galactic', { over: 0 }),
      aimAlong(GALACTIC_EDGE_ON, 0),
      hold(3),
      dollyTo(500, 20, 'easeInOutSine'),
      hold(4),
    ],
  },
};
