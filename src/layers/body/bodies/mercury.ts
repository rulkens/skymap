import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { MERCURY_GREY } from '../../../data/bodies/palette';

export const MERCURY: LayerBody = {
  body: heliocentricPlanet({
    id: 'mercury',
    label: 'Mercury',
    datumRadiusM: 2440000,
    albedo: [0.3, 0.29, 0.27],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Mercury, heliocentric. JPL: L = 252.25032350°, ϖ = 77.45779628°,
      // Ω = 48.33076593°.
      id: asSceneBodyId('mercury'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 0.38709927 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.20563593,
      inclinationRad: degToRad(7.00497902),
      ascendingNodeRad: degToRad(48.33076593),
      // ω = ϖ − Ω = 77.45779628 − 48.33076593
      argPeriapsisRad: degToRad(77.45779628 - 48.33076593),
      // M = L − ϖ = 252.25032350 − 77.45779628
      meanAnomalyRad: degToRad(252.2503235 - 77.45779628),
      // Rates (JPL, per Julian century): dL/dt = 149472.67411175, dϖ/dt = 0.16047689,
      // dΩ/dt = −0.12534081, da/dt = 0.00000037 au, de/dt = 0.00001906, dI/dt = −0.00594749.
      semiMajorRateMpcPerCty: 0.00000037 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: 0.00001906,
      inclinationRateRadPerCty: degToRad(-0.00594749),
      ascendingNodeRateRadPerCty: degToRad(-0.12534081),
      // dω/dt = dϖ/dt − dΩ/dt = 0.16047689 − (−0.12534081)
      argPeriapsisRateRadPerCty: degToRad(0.16047689 - -0.12534081),
      // dM/dt = dL/dt − dϖ/dt = 149472.67411175 − 0.16047689
      meanAnomalyRateRadPerCty: degToRad(149472.67411175 - 0.16047689),
      color: MERCURY_GREY,
    },
  },
  rotation: {
    id: 'mercury',
    poleRaDeg: 281.0103,
    poleDecDeg: 61.4155,
    primeMeridianDeg: 329.5988,
    spinRateDegPerDay: 6.1385108,
  },
};
