/**
 * flowStream — ride the stream: from the Milky Way, travel with the flow lines
 * to the Great Attractor (the Norma cluster), then on toward the Shapley
 * Concentration that pulls on all of it. The camera's motion follows the
 * galaxies' own, so the direction of travel is the argument.
 *
 * Positions are the structure seeds' RA/Dec/distance
 * (data/seeds/structure_anchors.seed.json), in equatorial Mpc.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  aimAlong,
  all,
  dollyTo,
  fade,
  hide,
  hold,
  moveTarget,
  scene,
  seq,
  wait,
} from '../../../services/engine/animation/effectHelpers';
import { setFlowEnabled } from '../../../layers/flow/state/flow/slice';
import { raDecDistToEqCart } from '../../../utils/math/raDecDistToEqCart';
import { normalize3 } from '../../../utils/math/normalize3';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';

const NORMA = raDecDistToEqCart({ raHours: 16.25, decDeg: -60.9, distMpc: 70 });
const SHAPLEY = raDecDistToEqCart({ raHours: 13.4167, decDeg: -31.0, distMpc: 195 });
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Down onto the direction of travel, so the streamlines ahead fill the frame.
const tilted = (dir: Vec3): Vec3 => normalize3([dir[0], dir[1], dir[2] - 0.45]);
const TO_NORMA = tilted(normalize3(NORMA));
const TO_SHAPLEY = tilted(normalize3(sub(SHAPLEY, NORMA)));

export const flowStream: Clip = {
  id: 'flowStream',
  label: 'Ride the cosmic flow',
  data: {
    start: {
      target: [0, 0, 0],
      distance: 60,
      ...orbitAnglesLookingAlong(TO_NORMA, ORIENTATION_FRAMES.ecliptic),
    },
    timeline: [
      // Clusters and superclusters keep their names (Norma, Shapley carry the meaning); voids,
      // groups and the rings only crowd the travel.
      hide(
        [
          'cosmicWebDensity',
          'cosmicWebFilaments',
          'label:famousGalaxy',
          'zoneOfAvoidance',
          'structureRing',
          'label:structure:void',
          'label:structure:galaxy-group',
        ],
        0,
      ),
      fade(['survey'], 0, 0),
      scene(setFlowEnabled(true)),
      hold(1.5),
      all([
        seq([
          moveTarget(NORMA, 12, 'easeInOutSine'),
          wait(1),
          all([moveTarget(SHAPLEY, 12, 'easeInOutSine'), aimAlong(TO_SHAPLEY, 6)]),
        ]),
        dollyTo(140, 25, 'easeInOutSine'),
      ]),
      hold(3),
    ],
  },
};
