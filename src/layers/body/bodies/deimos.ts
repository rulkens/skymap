import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ROCK } from '../../../data/bodies/palette';

export const DEIMOS: LayerBody = {
  body: satelliteBody({
    id: 'deimos',
    label: 'Deimos',
    datumRadiusM: 6000,
    reliefM: [-2418, 2708],
    albedo: [0.32, 0.3, 0.28],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Deimos: a=23457 e=0.000 ω=0.0 M=205.0 i=1.8 node=54.3 P=1.2625
      // Papsis=0.0 Pnode=56.2; pole RA=316.6 Dec=53.5 (tilt 0.9°). Prograde.
      // Papsis=0.0 (circular orbit → apsis undefined) ⇒ ω-rate frozen to 0.
      id: 'deimos',
      focusId: 'mars',
      semiMajorKm: 23457,
      eccentricity: 0.0,
      inclinationDeg: 1.8,
      ascendingNodeDeg: 54.3,
      argPeriapsisDeg: 0.0,
      meanAnomalyDeg: 205.0,
      periodDays: 1.2625,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 0.0,
      nodalPrecessionYears: 56.2,
      poleRaDeg: 316.6,
      poleDecDeg: 53.5,
      color: SAT_ROCK,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'deimos',
    poleRaDeg: 316.65,
    poleDecDeg: 53.52,
  },
};
