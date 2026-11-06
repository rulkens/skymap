/**
 * cosmicWebTracking — a tracking shot past the slime-mould web: the camera
 * trucks sideways across the SDSS wedge from 160 Mpc out, so near filaments
 * slide past faster than far ones and the web reads as a volume.
 *
 * Alongside, not through: inside the MCPM volume the raymarch turns to fog
 * and the bright knots blow out, while from outside the filaments stay sharp.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { hide, hold, moveTarget } from '../../../services/engine/animation/effectHelpers';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { COSMIC_WEB_POSE } from '../../../compositions/exhibits/cosmicWebPose';

const CENTRE = COSMIC_WEB_POSE.target;
const OUTWARD = normalize3(CENTRE);
// Across the line of sight, in the equatorial plane.
const SIDE = normalize3([-OUTWARD[1], OUTWARD[0], 0]);
const along = (mpc: number): Vec3 => [
  CENTRE[0] + SIDE[0] * mpc,
  CENTRE[1] + SIDE[1] * mpc,
  CENTRE[2] + SIDE[2] * mpc,
];

export const cosmicWebTracking: Clip = {
  id: 'cosmicWebTracking',
  label: 'Past the cosmic web',
  data: {
    start: {
      target: along(-100),
      distance: 160,
      ...orbitAnglesLookingAlong(
        normalize3([OUTWARD[0], OUTWARD[1], OUTWARD[2] - 0.3]),
        ORIENTATION_FRAMES.ecliptic,
      ),
    },
    timeline: [
      hide(['survey', 'labels', 'structureRing', 'zoneOfAvoidance'], 0),
      hold(1),
      moveTarget(along(100), 26, 'easeInOutSine'),
      hold(2),
    ],
  },
};
