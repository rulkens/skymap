/**
 * andromedaHero — one galaxy, given the whole video: from behind the Milky
 * Way, along our own sightline, across the 780 kpc to Andromeda, ending close
 * enough that the catalog dot has become the photograph.
 *
 * The aim stays on the Earth→M31 line throughout, the bearing the image was
 * taken from, so there is no turn to distract from the travel.
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
} from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';
import { raDecDistToEqCart } from '../../../utils/math/raDecDistToEqCart';

const M31 = focusId('m31');
// RA/Dec from data/seeds/famous_galaxies.seed.json.
const SIGHTLINE = raDecDistToEqCart({ raHours: 10.6846845 / 15, decDeg: 41.2689778, distMpc: 1 });

export const andromedaHero: Clip = {
  id: 'andromedaHero',
  label: 'Andromeda',
  data: {
    start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.12 },
    timeline: [
      // The four bulk surveys only add noise behind the curated images.
      hide(
        [
          'survey:sdss',
          'survey:2mrs',
          'survey:glade',
          'survey:milliquas',
          'label:structure',
          'structureRing',
          'cosmicWebDensity',
          'zoneOfAvoidance',
        ],
        0,
      ),
      // The Milky Way in the foreground, M31 a smudge beyond it.
      all([aimAlong(SIGHTLINE, 0), dollyTo(0.12, 0)]),
      hold(2),
      focus(M31),
      all([
        moveTargetId(M31, 14, 'easeInOutSine'),
        seq([dollyTo(0.35, 6, 'easeInOutSine'), dollyToId(M31, 8, { scale: 0.45 })]),
      ]),
      dollyToId(M31, 6, { ease: 'easeOutSine', scale: 0.3 }),
      hold(2),
    ],
  },
};
