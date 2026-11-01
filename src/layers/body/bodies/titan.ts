import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { TITAN_ORANGE } from '../../../data/bodies/palette';

export const TITAN: LayerBody = {
  body: satelliteBody({
    id: 'titan',
    label: 'Titan',
    datumRadiusM: 2575000,
    albedo: [0.8, 0.6, 0.35],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Titan: a=1221900 e=0.029 ω=78.3 M=11.7 i=0.3 node=78.6 P=15.945448
      // Papsis=346.680 Pnode=687.370; pole RA=36.4 Dec=84.0 (tilt 0.6°). Prograde.
      id: 'titan',
      focusId: 'saturn',
      semiMajorKm: 1221900,
      eccentricity: 0.029,
      inclinationDeg: 0.3,
      ascendingNodeDeg: 78.6,
      argPeriapsisDeg: 78.3,
      meanAnomalyDeg: 11.7,
      periodDays: 15.945448,
      periodKind: 'longitude',
      apsidalPrecessionYears: 346.68,
      nodalPrecessionYears: 687.37,
      poleRaDeg: 36.4,
      poleDecDeg: 84.0,
      color: TITAN_ORANGE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'titan',
    poleRaDeg: 39.4827,
    poleDecDeg: 83.4279,
  },
};
