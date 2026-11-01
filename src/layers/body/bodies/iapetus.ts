import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ROCK } from '../../../data/bodies/palette';

export const IAPETUS: LayerBody = {
  body: satelliteBody({
    id: 'iapetus',
    label: 'Iapetus',
    datumRadiusM: 735000,
    albedo: [0.4, 0.37, 0.32],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Iapetus: a=3561700 e=0.028 ω=254.5 M=74.8 i=7.6 node=86.5 P=79.331002
      // Papsis=1662.900 Pnode=3130.302; pole RA=288.7 Dec=78.9 (tilt 14.8°, so i=7.6° is
      // relative to THAT plane, not Saturn's equator). Prograde.
      id: 'iapetus',
      focusId: 'saturn',
      semiMajorKm: 3561700,
      eccentricity: 0.028,
      inclinationDeg: 7.6,
      ascendingNodeDeg: 86.5,
      argPeriapsisDeg: 254.5,
      meanAnomalyDeg: 74.8,
      periodDays: 79.331002,
      periodKind: 'longitude',
      apsidalPrecessionYears: 1662.9,
      nodalPrecessionYears: 3130.302,
      poleRaDeg: 288.7,
      poleDecDeg: 78.9,
      color: SAT_ROCK,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'iapetus',
    poleRaDeg: 318.16,
    poleDecDeg: 75.03,
  },
};
