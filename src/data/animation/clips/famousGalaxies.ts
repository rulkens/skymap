/**
 * famousGalaxies — four famous galaxies close up, each flown to and then
 * pushed in on, ending on M87 in the Virgo cluster: the jump from a catalog dot
 * to a real image is the subject.
 *
 * Each image is a photograph taken from Earth, so the camera arrives looking
 * along the Earth→galaxy line, where it shows face-on as photographed; any
 * other bearing foreshortens the quad (an orbit turned M51 into a sliver).
 * Opens at a fixed pose outside the Milky Way, not 'live', so it plays the same
 * from the Earth-scale boot pose a recording starts in.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  aimAlong,
  all,
  dollyToId,
  focus,
  hide,
  hold,
  moveTargetId,
  seq,
} from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';
import { raDecDistToEqCart } from '../../../utils/math/raDecDistToEqCart';

const FLY_SEC = 9;
const DWELL_SEC = 5;
// `focusOnId` lands at the standard framing, where the image is a tenth of the frame.
const ARRIVE_SCALE = 0.4;
const DWELL_SCALE = 0.3;

// RA/Dec in degrees, from data/seeds/famous_galaxies.seed.json.
const fromEarth = (raDeg: number, decDeg: number) =>
  raDecDistToEqCart({ raHours: raDeg / 15, decDeg, distMpc: 1 });

const visit = (raw: string, sightline: Vec3) => {
  const id = focusId(raw);
  return seq([
    focus(id),
    all([
      moveTargetId(id, FLY_SEC),
      dollyToId(id, FLY_SEC, { scale: ARRIVE_SCALE }),
      aimAlong(sightline, FLY_SEC),
    ]),
    dollyToId(id, DWELL_SEC, { ease: 'easeOutSine', scale: DWELL_SCALE }),
  ]);
};

export const famousGalaxies: Clip = {
  id: 'famousGalaxies',
  label: 'Famous galaxies close up',
  data: {
    start: { target: [0, -0.01, 0] as Vec3, yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
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
      visit('m31', fromEarth(10.6846845, 41.2689778)), // Andromeda
      visit('m81', fromEarth(148.8881565, 69.0652757)), // Bode's Galaxy
      visit('m104', fromEarth(189.997701, -11.6230104)), // Sombrero
      visit('m87', fromEarth(187.706364, 12.3905194)), // Virgo A
      hold(2),
    ],
  },
};
