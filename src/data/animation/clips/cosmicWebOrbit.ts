/**
 * cosmicWebOrbit — a slow orbit through the slime-mould reconstruction of the
 * cosmic web (the MCPM density volume), from the Cosmic Web exhibit's framing,
 * with every survey and label hidden so the filaments are the whole picture.
 *
 * The exhibit also switches on the all-sky 2MRS Polyphorm run; a clip has no
 * cue for volume items, so this shows the SDSS wedge alone.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { all, dollyTo, hide, hold, spin } from '../../../services/engine/animation/effectHelpers';
import { COSMIC_WEB_POSE } from '../../../compositions/exhibits/cosmicWebPose';

const DURATION_SEC = 26;

export const cosmicWebOrbit: Clip = {
  id: 'cosmicWebOrbit',
  label: 'Cosmic web orbit',
  data: {
    start: COSMIC_WEB_POSE,
    timeline: [
      hide(['survey', 'labels', 'structureRing', 'zoneOfAvoidance'], 0),
      all([
        spin('yaw', { by: 1.2, over: DURATION_SEC, ease: 'linear' }),
        dollyTo(COSMIC_WEB_POSE.distance * 0.7, DURATION_SEC, 'easeInOutSine'),
      ]),
      hold(2),
    ],
  },
};
