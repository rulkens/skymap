import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ROCK } from '../../../data/bodies/palette';

export const NEREID: LayerBody = {
  body: satelliteBody({
    id: 'nereid',
    label: 'Nereid',
    datumRadiusM: 170000,
    albedo: [0.155, 0.155, 0.155],
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Nereid (NEP105), JPL ecliptic frame, epoch 2020-01-01.0: a=5513900 e=0.751 ω=296.8 M=318.5
      // i=5.1 node=319.5 P=360.133039 Papsis=7990.433 Pnode=9426.334. Moved back 7304.5 d
      // (19.9986 yr) to J2000: M 318.5 - 0.99963058 deg/d * 7304.5 = 216.698; ω 296.8 - 0.901 =
      // 295.899; node 319.5 + 0.764 = 320.264 (node regresses). The ecliptic is the plane of the
      // ecliptic pole (RA 270, Dec 66.5607), whose node reference is the vernal equinox.
      id: 'nereid',
      focusId: 'neptune',
      semiMajorKm: 5513900,
      eccentricity: 0.751,
      inclinationDeg: 5.1,
      ascendingNodeDeg: 320.264,
      argPeriapsisDeg: 295.899,
      meanAnomalyDeg: 216.698,
      periodDays: 360.133039,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 7990.433,
      nodalPrecessionYears: 9426.334,
      poleRaDeg: 270,
      poleDecDeg: 66.5607,
      color: SAT_ROCK,
    }),
  },
};
