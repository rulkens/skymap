import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const DIONE: LayerBody = {
  body: satelliteBody({
    id: 'dione',
    label: 'Dione',
    datumRadiusM: 561000,
    albedo: [0.72, 0.72, 0.72],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Dione: a=377700 e=0.002 ω=116.0 M=212.0 i=0.0 node=0.0 P=2.736916
      // Papsis=11.698 Pnode=0.000; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
      // i≈0 ⇒ node undefined, Pnode=0.000 ⇒ Ω-rate frozen to 0.
      id: 'dione',
      focusId: 'saturn',
      semiMajorKm: 377700,
      eccentricity: 0.002,
      inclinationDeg: 0.0,
      ascendingNodeDeg: 0.0,
      argPeriapsisDeg: 116.0,
      meanAnomalyDeg: 212.0,
      periodDays: 2.736916,
      periodKind: 'longitude',
      apsidalPrecessionYears: 11.698,
      nodalPrecessionYears: 0.0,
      poleRaDeg: 40.6,
      poleDecDeg: 83.5,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'dione',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
};
