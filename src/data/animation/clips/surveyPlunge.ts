/**
 * surveyPlunge — the reverse of `flyout`: from outside the whole survey,
 * straight down through millions of galaxies into our Local Group, decelerating
 * on arrival so the dense middle rushes past and the landing reads.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { all, dollyTo, hide, hold, spin } from '../../../services/engine/animation/effectHelpers';

const PLUNGE_SEC = 22;

export const surveyPlunge: Clip = {
  id: 'surveyPlunge',
  label: 'Plunge to the Local Group',
  data: {
    start: { target: [0, 0, 0], yaw: -1.7455, pitch: -0.3589, distance: 6000 },
    timeline: [
      hide(['label:structure', 'structureRing', 'zoneOfAvoidance'], 0),
      hold(1.5),
      all([
        dollyTo(0.9, PLUNGE_SEC, 'easeInOutCubic'),
        spin('yaw', { by: -0.9, over: PLUNGE_SEC, ease: 'easeOutCubic' }),
      ]),
      hold(3),
    ],
  },
};
