/**
 * whirlpoolPushIn — one unbroken push from 6 Mpc out, where M51 is one dot
 * among thousands of survey galaxies, to its photograph filling the frame: the
 * moment a catalog point becomes an image, with nothing else moving.
 *
 * Looks along the Earth→M51 line (the bearing of the photograph) so the face-on
 * spiral reads as itself; the push eases out so the arrival lingers.
 */

import type { Clip } from '../../../@types/animation/Clip';
import {
  aimAlong,
  all,
  dollyTo,
  dollyToId,
  focus,
  hide,
  hold,
  moveTargetId,
  seq,
  wait,
} from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';
import { raDecDistToEqCart } from '../../../utils/math/raDecDistToEqCart';

const M51 = focusId('m51');
// RA/Dec from data/seeds/famous_galaxies.seed.json.
const SIGHTLINE = raDecDistToEqCart({ raHours: 202.469547 / 15, decDeg: 47.195151, distMpc: 1 });

export const whirlpoolPushIn: Clip = {
  id: 'whirlpoolPushIn',
  label: 'Whirlpool push-in',
  data: {
    start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
    timeline: [
      hide(['labels', 'structureRing', 'cosmicWebDensity', 'zoneOfAvoidance'], 0),
      all([moveTargetId(M51, 0), dollyTo(6, 0), aimAlong(SIGHTLINE, 0)]),
      focus(M51),
      hold(1),
      all([
        dollyToId(M51, 22, { ease: 'easeOutSine', scale: 0.45 }),
        // Once the image resolves, the survey points behind it fall away: the
        // dot among thousands has become the one subject.
        seq([wait(13), hide(['survey:sdss', 'survey:2mrs', 'survey:glade', 'survey:milliquas'], 5)]),
      ]),
      hold(3),
    ],
  },
};
