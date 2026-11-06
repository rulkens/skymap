/**
 * cosmicWebGrow — the method as a story: first only the galaxies (the slime
 * mould's food), then the web it grew between them fades in on top, then
 * the galaxies fall away and the web stands alone. A slow orbit throughout
 * keeps both layers reading in 3D.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { all, hide, seq, show, spin, wait } from '../../../services/engine/animation/effectHelpers';
import { COSMIC_WEB_POSE } from '../../../compositions/exhibits/cosmicWebPose';

const DURATION_SEC = 28;

export const cosmicWebGrow: Clip = {
  id: 'cosmicWebGrow',
  label: 'Galaxies to cosmic web',
  data: {
    start: COSMIC_WEB_POSE,
    timeline: [
      // Every survey, not SDSS alone: at this distance SDSS by itself is sub-pixel.
      hide(['cosmicWebDensity', 'labels', 'structureRing', 'zoneOfAvoidance'], 0),
      all([
        seq([wait(5), show(['cosmicWebDensity'], 6), wait(8), hide(['survey'], 4)]),
        spin('yaw', { by: 1.1, over: DURATION_SEC, ease: 'linear' }),
      ]),
    ],
  },
};
