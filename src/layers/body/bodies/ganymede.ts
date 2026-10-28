import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ROCK } from '../../../data/bodies/palette';

export const GANYMEDE: LayerBody = {
  body: satelliteBody({
    id: 'ganymede',
    label: 'Ganymede',
    datumRadiusM: 2634000,
    albedo: [0.55, 0.52, 0.48],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Ganymede: a=1070400 e=0.001 ω=198.3 M=324.8 i=0.2 node=58.5 P=7.155588
      // Papsis=68.301 Pnode=137.812; pole RA=268.2 Dec=64.6 (tilt 0.1°). Prograde.
      id: 'ganymede',
      focusId: 'jupiter',
      semiMajorKm: 1070400,
      eccentricity: 0.001,
      inclinationDeg: 0.2,
      ascendingNodeDeg: 58.5,
      argPeriapsisDeg: 198.3,
      meanAnomalyDeg: 324.8,
      periodDays: 7.155588,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 68.301,
      nodalPrecessionYears: 137.812,
      poleRaDeg: 268.2,
      poleDecDeg: 64.6,
      color: SAT_ROCK,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'ganymede',
    poleRaDeg: 268.2,
    poleDecDeg: 64.57,
  },
};
