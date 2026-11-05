/**
 * gaiaNeighbourhood — the stars within a few parsecs, orbited so they read as
 * a 3D neighbourhood around the Sun rather than a sky, then a pull back until
 * they merge into the Gaia field around us (300 pc; farther, the disc's glow
 * swallows the stars).
 */

import type { Clip } from '../../../@types/animation/Clip';
import { all, dollyTo, hide, show, hold, seq, spin } from '../../../services/engine/animation/effectHelpers';
import { SCALE_UNITS } from '../../scaleUnits';

const PC = SCALE_UNITS.PC_TO_MPC;
const DURATION_SEC = 28;

export const gaiaNeighbourhood: Clip = {
  id: 'gaiaNeighbourhood',
  label: 'The solar neighbourhood',
  data: {
    start: { target: [0, 0, 0], yaw: 0.6, pitch: 0.45, distance: 9 * PC },
    timeline: [
      // Only the Sun keeps its name: dozens of star names hide the starfield they label.
      hide(['labels', 'structureRing'], 0),
      show(['label:body'], 0),
      all([
        spin('yaw', { by: 1.8, over: DURATION_SEC, ease: 'linear' }),
        seq([hold(9), dollyTo(300 * PC, 17, 'easeInOutSine'), hold(2)]),
      ]),
    ],
  },
};
