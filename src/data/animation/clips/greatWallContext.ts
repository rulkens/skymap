/**
 * greatWallContext — context to subject: the whole survey volume first, the
 * DESI wall already in it, then a push in while every other catalog fades
 * away, so the wall is isolated out of the field it was found in.
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
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';

const WALL_CENTRE_MPC: Vec3 = [-300, 60, 3];
const FROM_EARTH = orbitAnglesLookingAlong(normalize3(WALL_CENTRE_MPC), ORIENTATION_FRAMES.ecliptic);
const DURATION_SEC = 24;

export const greatWallContext: Clip = {
  id: 'greatWallContext',
  label: 'Sloan Great Wall in context',
  data: {
    start: {
      target: WALL_CENTRE_MPC,
      // Side-on, not from behind Earth: from our side the camera looks through
      // the dense local volume, which blows out into one bright blob.
      distance: 1100,
      yaw: FROM_EARTH.yaw + Math.PI / 2,
      pitch: FROM_EARTH.pitch + 0.45,
    },
    timeline: [
      hide(['labels', 'structureRing', 'cosmicWebDensity'], 0),
      show(['survey:desiSgw'], 0),
      all([
        dollyTo(330, DURATION_SEC, 'easeInOutSine'),
        spin('yaw', { by: 0.7, over: DURATION_SEC }),
        seq([
          wait(9),
          hide(['survey:sdss', 'survey:2mrs', 'survey:glade', 'survey:milliquas', 'survey:famousGalaxy'], 6),
        ]),
      ]),
      hold(2),
    ],
  },
};
