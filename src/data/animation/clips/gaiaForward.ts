/**
 * gaiaForward — fly forward through the Gaia starfield toward the Galactic
 * Centre: the camera travels instead of zooming, so near stars stream past
 * faster than far ones (parallax) and new chunks of the catalog stream in
 * ahead, which is the post's subject.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { hide, show, hold, moveTarget } from '../../../services/engine/animation/effectHelpers';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { GAL_X_EQ, ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCALE_UNITS } from '../../scaleUnits';

const PC = SCALE_UNITS.PC_TO_MPC;
const TRAVEL_PC = 600;
const END: Vec3 = [
  GAL_X_EQ[0] * TRAVEL_PC * PC,
  GAL_X_EQ[1] * TRAVEL_PC * PC,
  GAL_X_EQ[2] * TRAVEL_PC * PC,
];

export const gaiaForward: Clip = {
  id: 'gaiaForward',
  label: 'Forward through the Gaia stars',
  data: {
    start: {
      target: [0, 0, 0],
      distance: 4 * PC,
      ...orbitAnglesLookingAlong(GAL_X_EQ, ORIENTATION_FRAMES.ecliptic),
    },
    timeline: [
      // Only the Sun keeps its name: dozens of star names hide the starfield they label.
      hide(['labels', 'structureRing'], 0),
      show(['label:body'], 0),
      hold(1),
      moveTarget(END, 26, 'easeInOutSine'),
      hold(2),
    ],
  },
};
