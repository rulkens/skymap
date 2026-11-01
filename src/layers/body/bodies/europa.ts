import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const EUROPA: LayerBody = {
  body: satelliteBody({
    id: 'europa',
    label: 'Europa',
    datumRadiusM: 1561000,
    albedo: [0.75, 0.75, 0.72],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Europa: a=671100 e=0.009 ω=45.0 M=345.4 i=0.5 node=184.0 P=3.525463
      // Papsis=1.394 Pnode=30.202; pole RA=268.1 Dec=64.5 (tilt 0.0°). Prograde.
      id: 'europa',
      focusId: 'jupiter',
      semiMajorKm: 671100,
      eccentricity: 0.009,
      inclinationDeg: 0.5,
      ascendingNodeDeg: 184.0,
      argPeriapsisDeg: 45.0,
      meanAnomalyDeg: 345.4,
      periodDays: 3.525463,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: -1.394,
      nodalPrecessionYears: 30.202,
      poleRaDeg: 268.1,
      poleDecDeg: 64.5,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'europa',
    poleRaDeg: 268.08,
    poleDecDeg: 64.51,
  },
};
