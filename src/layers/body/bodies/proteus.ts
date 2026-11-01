import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ROCK } from '../../../data/bodies/palette';

export const PROTEUS: LayerBody = {
  body: satelliteBody({
    id: 'proteus',
    label: 'Proteus',
    datumRadiusM: 210000,
    albedo: [0.096, 0.096, 0.096],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Proteus: a=117600 e=0.000 ω=0.0 M=276.8 i=0.0 node=0.0 P=1.122315
      // Papsis=0.000 Pnode=0.000; pole RA=299.8 Dec=42.6. Prograde. 360/P is the IAU spin rate to 4 decimals.
      id: 'proteus',
      focusId: 'neptune',
      semiMajorKm: 117600,
      eccentricity: 0.0,
      inclinationDeg: 0.0,
      ascendingNodeDeg: 0.0,
      argPeriapsisDeg: 0.0,
      meanAnomalyDeg: 276.8,
      periodDays: 1.122315,
      periodKind: 'longitude',
      apsidalPrecessionYears: 0.0,
      nodalPrecessionYears: 0.0,
      poleRaDeg: 299.8,
      poleDecDeg: 42.6,
      color: SAT_ROCK,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'proteus',
    poleRaDeg: 299.27,
    poleDecDeg: 42.91,
  },
};
