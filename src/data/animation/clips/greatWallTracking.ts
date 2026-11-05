/**
 * greatWallTracking — a tracking shot along the Sloan Great Wall's 400 Mpc
 * length in the DESI patch: the camera trucks sideways at a fixed distance, so
 * the wall's lumps and filaments slide past with parallax and its sheer length
 * is felt as travel time rather than told.
 *
 * The wall's long axis is equatorial y (the ellipsoid centres in
 * `tools/catalog/desiPatches.ts` run from y ≈ −110 to +220 Mpc at x ≈ −300).
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { hide, hold, moveTarget, show } from '../../../services/engine/animation/effectHelpers';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';

const FROM: Vec3 = [-305, -170, 3];
const TO: Vec3 = [-305, 280, 3];
// From our side and a little above, square to the direction of travel.
const FORWARD = normalize3([-1, 0, -0.35]);

export const greatWallTracking: Clip = {
  id: 'greatWallTracking',
  label: 'Along the Sloan Great Wall',
  data: {
    start: {
      target: FROM,
      distance: 190,
      ...orbitAnglesLookingAlong(FORWARD, ORIENTATION_FRAMES.ecliptic),
    },
    timeline: [
      hide(['labels', 'structureRing', 'cosmicWebDensity', 'survey'], 0),
      show(['survey:desiSgw'], 0),
      hold(1),
      moveTarget(TO, 26, 'easeInOutSine'),
      hold(2),
    ],
  },
};
