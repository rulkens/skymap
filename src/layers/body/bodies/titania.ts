import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const TITANIA: LayerBody = {
  body: satelliteBody({
    id: 'titania',
    label: 'Titania',
    datumRadiusM: 788900,
    albedo: [0.27, 0.27, 0.27],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Titania: a=436298 e=0.002 ω=184.0 M=68.1 i=0.1 node=29.5 P=8.705869
      // Papsis=579.928 Pnode=1644.649. Prograde.
      id: 'titania',
      focusId: 'uranus',
      semiMajorKm: 436298,
      eccentricity: 0.002,
      inclinationDeg: 0.1,
      ascendingNodeDeg: 29.5,
      argPeriapsisDeg: 184.0,
      meanAnomalyDeg: 68.1,
      periodDays: 8.705869,
      periodKind: 'longitude',
      apsidalPrecessionYears: 579.928,
      nodalPrecessionYears: 1644.649,
      poleRaDeg: 77.311,
      poleDecDeg: 15.175,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'titania',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
};
