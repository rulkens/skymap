import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const UMBRIEL: LayerBody = {
  body: satelliteBody({
    id: 'umbriel',
    label: 'Umbriel',
    datumRadiusM: 584700,
    albedo: [0.21, 0.21, 0.21],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Umbriel: a=265986 e=0.004 ω=183.4 M=253.0 i=0.1 node=174.8 P=4.144177
      // Papsis=64.126 Pnode=129.745. Prograde.
      id: 'umbriel',
      focusId: 'uranus',
      semiMajorKm: 265986,
      eccentricity: 0.004,
      inclinationDeg: 0.1,
      ascendingNodeDeg: 174.8,
      argPeriapsisDeg: 183.4,
      meanAnomalyDeg: 253.0,
      periodDays: 4.144177,
      periodKind: 'longitude',
      apsidalPrecessionYears: 64.126,
      nodalPrecessionYears: 129.745,
      poleRaDeg: 77.311,
      poleDecDeg: 15.175,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'umbriel',
    poleRaDeg: 257.43,
    poleDecDeg: -15.1,
  },
};
