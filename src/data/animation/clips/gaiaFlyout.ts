/**
 * gaiaFlyout — out from the Sun through the Gaia starfield until the Milky
 * Way's disc appears, ending framed on the Galactic Centre.
 *
 * The aim never changes: the camera looks toward the Galactic Centre from 35°
 * above the plane the whole way, so the stars stream past and the disc grows
 * in the same direction. The pivot slides to the centre only over the dolly's
 * last fifth, where it is a few orbit radii rather than a slew (see
 * `flyToPoseClip`).
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { all, dollyTo, hide, show, hold, moveTarget, seq, wait } from '../../../services/engine/animation/effectHelpers';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import { GAL_X_EQ, GAL_Z_EQ, ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { GALACTIC_CENTRE_ANCHOR } from '../../places/galacticCentre';
import { SCALE_UNITS } from '../../scaleUnits';

const START_MPC = 2 * SCALE_UNITS.PC_TO_MPC; // just past α Cen (1.3 pc), so the first seconds move
const END_MPC = 32 * SCALE_UNITS.KPC_TO_MPC;
const DOLLY_SEC = 28;
const REFRAME_SEC = 8;
const ELEVATION_RAD = (35 * Math.PI) / 180;

const c = Math.cos(ELEVATION_RAD);
const s = Math.sin(ELEVATION_RAD);
const FORWARD: Vec3 = normalize3([
  c * GAL_X_EQ[0] - s * GAL_Z_EQ[0],
  c * GAL_X_EQ[1] - s * GAL_Z_EQ[1],
  c * GAL_X_EQ[2] - s * GAL_Z_EQ[2],
]);

export const gaiaFlyout: Clip = {
  id: 'gaiaFlyout',
  label: 'Out through the Gaia stars',
  data: {
    start: {
      target: [0, 0, 0], // the Sun sits at the render origin
      distance: START_MPC,
      ...orbitAnglesLookingAlong(FORWARD, ORIENTATION_FRAMES.ecliptic),
    },
    timeline: [
      // Only the Sun keeps its name: dozens of star names hide the starfield they label.
      hide(['labels', 'structureRing'], 0),
      show(['label:body'], 0),
      all([
        dollyTo(END_MPC, DOLLY_SEC, 'easeInOutSine'),
        seq([
          wait(DOLLY_SEC - REFRAME_SEC + 2),
          moveTarget(GALACTIC_CENTRE_ANCHOR.positionMpc, REFRAME_SEC, 'easeInOutSine'),
        ]),
      ]),
      hold(3),
    ],
  },
};
