/**
 * zoneOfAvoidanceSurveys — the band, survey by survey, edge-on from 400 Mpc
 * with the plane level: 2MRS alone (near-infrared, all-sky, so the gap is only
 * the dust band itself), then GLADE and SDSS pile in and the band stays empty
 * however many galaxies arrive. SDSS alone is sub-pixel at this distance, so
 * it can't open the sequence.
 */

import type { Clip } from '../../../@types/animation/Clip';
import {
  aimAlong,
  all,
  dollyTo,
  frameTo,
  hide,
  wait,
  seq,
  show,
} from '../../../services/engine/animation/effectHelpers';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { GALACTIC_EDGE_ON } from './makers/galacticSightlines';

const DURATION_SEC = 24;

export const zoneOfAvoidanceSurveys: Clip = {
  id: 'zoneOfAvoidanceSurveys',
  label: 'Zone of Avoidance, survey by survey',
  data: {
    start: {
      target: [0, 0, 0],
      distance: 400,
      ...orbitAnglesLookingAlong(GALACTIC_EDGE_ON, ORIENTATION_FRAMES.ecliptic),
    },
    timeline: [
      hide(
        [
          'labels',
          'structureRing',
          'cosmicWebDensity',
          'survey:sdss',
          'survey:glade',
          'survey:milliquas',
        ],
        0,
      ),
      frameTo('galactic', { over: 0 }),
      aimAlong(GALACTIC_EDGE_ON, 0),
      all([
        seq([
          wait(7),
          show(['survey:glade', 'survey:sdss'], 3),
          wait(DURATION_SEC - 7),
        ]),
        dollyTo(300, DURATION_SEC, 'easeInOutSine'),
      ]),
    ],
  },
};
