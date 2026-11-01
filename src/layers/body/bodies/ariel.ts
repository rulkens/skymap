import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const ARIEL: LayerBody = {
  body: satelliteBody({
    id: 'ariel',
    label: 'Ariel',
    datumRadiusM: 578900,
    albedo: [0.39, 0.39, 0.39],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Ariel: a=190929 e=0.001 ω=9.6 M=193.5 i=0.0 node=0.0 P=2.520379
      // Papsis=28.901 Pnode=0.000. Prograde.
      id: 'ariel',
      focusId: 'uranus',
      semiMajorKm: 190929,
      eccentricity: 0.001,
      inclinationDeg: 0.0,
      ascendingNodeDeg: 0.0,
      argPeriapsisDeg: 9.6,
      meanAnomalyDeg: 193.5,
      periodDays: 2.520379,
      periodKind: 'longitude',
      apsidalPrecessionYears: 28.901,
      nodalPrecessionYears: 0.0,
      poleRaDeg: 77.311,
      poleDecDeg: 15.175,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'ariel',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
};
