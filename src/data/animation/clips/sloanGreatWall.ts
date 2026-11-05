/**
 * sloanGreatWall — the Sloan Great Wall alone, in the DESI DR1 patch around
 * it, fading in from black and orbited for parallax.
 *
 * Every other survey is hidden: the wall sits behind 300 Mpc of SDSS from any
 * useful angle, and in SDSS's sparser sampling it doesn't read as one structure.
 * There is no structure seed for the wall (it exists only as the `desiSgw`
 * catalog); the target is the middle of that patch's ellipsoid union in
 * `tools/catalog/desiPatches.ts`, in equatorial Mpc like every world position.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { all, dollyTo, hide, hold, show, spin } from '../../../services/engine/animation/effectHelpers';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';

const WALL_CENTRE_MPC: Vec3 = [-300, 60, 3];
// From our side the wall's long axis (equatorial y) lies across the frame.
const FROM_EARTH = orbitAnglesLookingAlong(normalize3(WALL_CENTRE_MPC), ORIENTATION_FRAMES.ecliptic);
const ELEVATION_RAD = 0.35; // enough to see the wall's depth, not so much it reads face-on
const DURATION_SEC = 24;

export const sloanGreatWall: Clip = {
  id: 'sloanGreatWall',
  label: 'Sloan Great Wall (DESI)',
  data: {
    start: {
      target: WALL_CENTRE_MPC,
      distance: 600,
      yaw: FROM_EARTH.yaw - 0.4,
      pitch: FROM_EARTH.pitch + ELEVATION_RAD,
    },
    timeline: [
      hide(['labels', 'structureRing', 'cosmicWebDensity', 'survey'], 0),
      show(['survey:desiSgw'], 3),
      all([
        dollyTo(300, DURATION_SEC, 'easeInOutSine'),
        spin('yaw', { by: 0.8, over: DURATION_SEC }),
      ]),
      hold(2),
    ],
  },
};
