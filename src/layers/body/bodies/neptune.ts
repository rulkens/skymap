import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { NEPTUNE_BLUE } from '../../../data/bodies/palette';

export const NEPTUNE: LayerBody = {
  body: heliocentricPlanet({
    id: 'neptune',
    label: 'Neptune',
    datumRadiusM: 24622000,
    albedo: [0.3, 0.42, 0.75],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Neptune, heliocentric. JPL: L = −55.12002969°, ϖ = 44.96476227°,
      // Ω = 131.78422574°.
      id: asSceneBodyId('neptune'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 30.06992276 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.00859048,
      inclinationRad: degToRad(1.77004347),
      ascendingNodeRad: degToRad(131.78422574),
      // ω = ϖ − Ω = 44.96476227 − 131.78422574
      argPeriapsisRad: degToRad(44.96476227 - 131.78422574),
      // M = L − ϖ = −55.12002969 − 44.96476227
      meanAnomalyRad: degToRad(-55.12002969 - 44.96476227),
      // Rates (JPL, per Julian century): dL/dt = 218.45945325, dϖ/dt = −0.32241464,
      // dΩ/dt = −0.00508664, da/dt = 0.00026291 au, de/dt = 0.00005105, dI/dt = 0.00035372.
      semiMajorRateMpcPerCty: 0.00026291 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: 0.00005105,
      inclinationRateRadPerCty: degToRad(0.00035372),
      ascendingNodeRateRadPerCty: degToRad(-0.00508664),
      // dω/dt = dϖ/dt − dΩ/dt = −0.32241464 − (−0.00508664)
      argPeriapsisRateRadPerCty: degToRad(-0.32241464 - -0.00508664),
      // dM/dt = dL/dt − dϖ/dt = 218.45945325 − (−0.32241464)
      meanAnomalyRateRadPerCty: degToRad(218.45945325 - -0.32241464),
      color: NEPTUNE_BLUE,
    },
  },
  rotation: {
    id: 'neptune',
    poleRaDeg: 299.36,
    poleDecDeg: 43.46,
    primeMeridianDeg: 249.978,
    spinRateDegPerDay: 541.1397757,
  },
};
