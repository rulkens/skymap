import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const OBERON: LayerBody = {
  body: satelliteBody({
    id: 'oberon',
    label: 'Oberon',
    datumRadiusM: 761400,
    albedo: [0.23, 0.23, 0.23],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Oberon: a=583511 e=0.002 ω=132.2 M=143.6 i=0.1 node=76.8 P=13.463237
      // Papsis=158.604 Pnode=192.798. Prograde.
      id: 'oberon',
      focusId: 'uranus',
      semiMajorKm: 583511,
      eccentricity: 0.002,
      inclinationDeg: 0.1,
      ascendingNodeDeg: 76.8,
      argPeriapsisDeg: 132.2,
      meanAnomalyDeg: 143.6,
      periodDays: 13.463237,
      periodKind: 'longitude',
      apsidalPrecessionYears: 158.604,
      nodalPrecessionYears: 192.798,
      poleRaDeg: 77.311,
      poleDecDeg: 15.175,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'oberon',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
};
