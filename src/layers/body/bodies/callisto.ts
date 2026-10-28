import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ROCK } from '../../../data/bodies/palette';

export const CALLISTO: LayerBody = {
  body: satelliteBody({
    id: 'callisto',
    label: 'Callisto',
    datumRadiusM: 2410000,
    albedo: [0.4, 0.38, 0.35],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Callisto: a=1882700 e=0.007 ω=43.8 M=87.4 i=0.3 node=309.1 P=16.690440
      // Papsis=277.921 Pnode=577.264; pole RA=268.7 Dec=64.8 (tilt 0.4°). Prograde.
      id: 'callisto',
      focusId: 'jupiter',
      semiMajorKm: 1882700,
      eccentricity: 0.007,
      inclinationDeg: 0.3,
      ascendingNodeDeg: 309.1,
      argPeriapsisDeg: 43.8,
      meanAnomalyDeg: 87.4,
      periodDays: 16.69044,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 277.921,
      nodalPrecessionYears: 577.264,
      poleRaDeg: 268.7,
      poleDecDeg: 64.8,
      color: SAT_ROCK,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'callisto',
    poleRaDeg: 268.72,
    poleDecDeg: 64.83,
  },
};
