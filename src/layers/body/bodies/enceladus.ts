import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const ENCELADUS: LayerBody = {
  body: satelliteBody({
    id: 'enceladus',
    label: 'Enceladus',
    datumRadiusM: 252000,
    albedo: [0.92, 0.92, 0.92],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Enceladus: a=238400 e=0.005 ω=119.5 M=57.0 i=0.0 node=0.0 P=1.370218
      // Papsis=2.916 Pnode=0.000; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
      // i≈0 ⇒ node undefined, Pnode=0.000 ⇒ Ω-rate frozen to 0.
      id: 'enceladus',
      focusId: 'saturn',
      semiMajorKm: 238400,
      eccentricity: 0.005,
      inclinationDeg: 0.0,
      ascendingNodeDeg: 0.0,
      argPeriapsisDeg: 119.5,
      meanAnomalyDeg: 57.0,
      periodDays: 1.370218,
      periodKind: 'longitude',
      apsidalPrecessionYears: 2.916,
      nodalPrecessionYears: 0.0,
      poleRaDeg: 40.6,
      poleDecDeg: 83.5,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'enceladus',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
};
