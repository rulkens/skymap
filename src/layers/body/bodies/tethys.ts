import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const TETHYS: LayerBody = {
  body: satelliteBody({
    id: 'tethys',
    label: 'Tethys',
    datumRadiusM: 531000,
    albedo: [0.76, 0.77, 0.77],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Tethys: a=295000 e=0.001 ω=335.3 M=0.0 i=1.1 node=273.0 P=1.887802
      // Papsis=0.005 Pnode=4.982; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
      // Papsis=0.005 yr is a near-circular-orbit table artifact (72000°/yr taken
      // literally) ⇒ ω-rate frozen to 0 (degenerate periapsis; error ≤ e·a).
      id: 'tethys',
      focusId: 'saturn',
      semiMajorKm: 295000,
      eccentricity: 0.001,
      inclinationDeg: 1.1,
      ascendingNodeDeg: 273.0,
      argPeriapsisDeg: 335.3,
      meanAnomalyDeg: 0.0,
      periodDays: 1.887802,
      periodKind: 'longitude',
      apsidalPrecessionYears: 0.005,
      nodalPrecessionYears: 4.982,
      poleRaDeg: 40.6,
      poleDecDeg: 83.5,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'tethys',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
};
