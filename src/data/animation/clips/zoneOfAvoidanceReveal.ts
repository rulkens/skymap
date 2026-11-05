/**
 * zoneOfAvoidanceReveal — what the empty band through every galaxy map is:
 * a thin slice of sky centred on us, lined up with our own galaxy's disc.
 *
 * Three beats, all under the galactic pole so the plane stays level on screen:
 * edge-on from 500 Mpc the gap is a bow-tie with its waist at the centre; a
 * tilt out of the plane fills it in (it is a slab, not a hole); back edge-on,
 * the dolly into the waist lands on the Milky Way, edge-on inside the gap,
 * where the band guide (drawn only below ~6 Mpc) fades in on its own.
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
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { GALACTIC_EDGE_ON, GALACTIC_FROM_ABOVE } from './makers/galacticSightlines';

const FAR_MPC = 500; // the survey volume, where the gap in the data reads as a band
const MILKY_WAY_MPC = 0.06; // the disc fills about a fifth of the frame

export const zoneOfAvoidanceReveal: Clip = {
  id: 'zoneOfAvoidanceReveal',
  label: 'Zone of Avoidance reveal',
  data: {
    start: {
      target: [0, 0, 0],
      distance: FAR_MPC,
      ...orbitAnglesLookingAlong(GALACTIC_EDGE_ON, ORIENTATION_FRAMES.ecliptic),
    },
    timeline: [
      hide(['labels', 'structureRing', 'cosmicWebDensity'], 0),
      show(['label:milkyWay', 'label:zoneOfAvoidance'], 0),
      frameTo('galactic', { over: 0 }),
      aimAlong(GALACTIC_EDGE_ON, 0),
      hold(6), // the bow-tie gap, level across the frame
      aimAlong(GALACTIC_FROM_ABOVE, 5),
      hold(1.5), // from above the gap fills in: it is a slab
      aimAlong(GALACTIC_EDGE_ON, 5),
      dollyTo(MILKY_WAY_MPC, 14, 'easeInOutSine'),
      hold(4),
    ],
  },
};
