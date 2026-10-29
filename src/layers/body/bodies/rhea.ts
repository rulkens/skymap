import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const RHEA: LayerBody = {
  body: satelliteBody({
    id: 'rhea',
    label: 'Rhea',
    datumRadiusM: 764000,
    albedo: [0.7, 0.71, 0.71],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Rhea: a=527200 e=0.001 ω=44.3 M=31.5 i=0.3 node=133.7 P=4.517503
      // Papsis=33.939 Pnode=35.775; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
      id: 'rhea',
      focusId: 'saturn',
      semiMajorKm: 527200,
      eccentricity: 0.001,
      inclinationDeg: 0.3,
      ascendingNodeDeg: 133.7,
      argPeriapsisDeg: 44.3,
      meanAnomalyDeg: 31.5,
      periodDays: 4.517503,
      periodKind: 'longitude',
      apsidalPrecessionYears: 33.939,
      nodalPrecessionYears: 35.775,
      poleRaDeg: 40.6,
      poleDecDeg: 83.5,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'rhea',
    poleRaDeg: 40.38,
    poleDecDeg: 83.55,
  },
};
