import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { JUPITER_TAN } from '../../../data/bodies/palette';

export const JUPITER: LayerBody = {
  body: heliocentricPlanet({
    id: 'jupiter',
    label: 'Jupiter',
    datumRadiusM: 69911000,
    albedo: [0.8, 0.65, 0.45],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Jupiter, heliocentric. JPL: L = 34.39644051°, ϖ = 14.72847983°,
      // Ω = 100.47390909°.
      id: asSceneBodyId('jupiter'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 5.202887 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.04838624,
      inclinationRad: degToRad(1.30439695),
      ascendingNodeRad: degToRad(100.47390909),
      // ω = ϖ − Ω = 14.72847983 − 100.47390909
      argPeriapsisRad: degToRad(14.72847983 - 100.47390909),
      // M = L − ϖ = 34.39644051 − 14.72847983
      meanAnomalyRad: degToRad(34.39644051 - 14.72847983),
      // Rates (JPL, per Julian century): dL/dt = 3034.74612775, dϖ/dt = 0.21252668,
      // dΩ/dt = 0.20469106, da/dt = −0.00011607 au, de/dt = −0.00013253, dI/dt = −0.00183714.
      semiMajorRateMpcPerCty: -0.00011607 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: -0.00013253,
      inclinationRateRadPerCty: degToRad(-0.00183714),
      ascendingNodeRateRadPerCty: degToRad(0.20469106),
      // dω/dt = dϖ/dt − dΩ/dt = 0.21252668 − 0.20469106
      argPeriapsisRateRadPerCty: degToRad(0.21252668 - 0.20469106),
      // dM/dt = dL/dt − dϖ/dt = 3034.74612775 − 0.21252668
      meanAnomalyRateRadPerCty: degToRad(3034.74612775 - 0.21252668),
      color: JUPITER_TAN,
    },
  },
  rotation: {
    id: 'jupiter',
    poleRaDeg: 268.056595,
    poleDecDeg: 64.495303,
    primeMeridianDeg: 284.95,
    spinRateDegPerDay: 870.536,
  },
};
