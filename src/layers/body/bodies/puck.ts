import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const PUCK: LayerBody = {
  body: satelliteBody({
    id: 'puck',
    label: 'Puck',
    datumRadiusM: 81000,
    albedo: [0.11, 0.11, 0.11],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Puck: a=86004 e=0.000 ω=0.0 M=50.1 i=0.3 node=216.1 P=0.761833
      // Papsis=2.226 Pnode=4.454. Prograde.
      id: 'puck',
      focusId: 'uranus',
      semiMajorKm: 86004,
      eccentricity: 0.0,
      inclinationDeg: 0.3,
      ascendingNodeDeg: 216.1,
      argPeriapsisDeg: 0.0,
      meanAnomalyDeg: 50.1,
      periodDays: 0.761833,
      periodKind: 'longitude',
      apsidalPrecessionYears: 2.226,
      nodalPrecessionYears: 4.454,
      poleRaDeg: 77.311,
      poleDecDeg: 15.175,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'puck',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
};
