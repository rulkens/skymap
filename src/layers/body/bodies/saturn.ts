import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { SATURN_GOLD } from '../../../data/bodies/palette';

export const SATURN: LayerBody = {
  body: heliocentricPlanet({
    id: 'saturn',
    label: 'Saturn',
    datumRadiusM: 58232000,
    albedo: [0.8, 0.7, 0.5],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Saturn, heliocentric. JPL: L = 49.95424423°, ϖ = 92.59887831°,
      // Ω = 113.66242448°.
      id: asSceneBodyId('saturn'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 9.53667594 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.05386179,
      inclinationRad: degToRad(2.48599187),
      ascendingNodeRad: degToRad(113.66242448),
      // ω = ϖ − Ω = 92.59887831 − 113.66242448
      argPeriapsisRad: degToRad(92.59887831 - 113.66242448),
      // M = L − ϖ = 49.95424423 − 92.59887831
      meanAnomalyRad: degToRad(49.95424423 - 92.59887831),
      // Rates (JPL, per Julian century): dL/dt = 1222.49362201, dϖ/dt = −0.41897216,
      // dΩ/dt = −0.28867794, da/dt = −0.00125060 au, de/dt = −0.00050991, dI/dt = 0.00193609.
      semiMajorRateMpcPerCty: -0.0012506 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: -0.00050991,
      inclinationRateRadPerCty: degToRad(0.00193609),
      ascendingNodeRateRadPerCty: degToRad(-0.28867794),
      // dω/dt = dϖ/dt − dΩ/dt = −0.41897216 − (−0.28867794)
      argPeriapsisRateRadPerCty: degToRad(-0.41897216 - -0.28867794),
      // dM/dt = dL/dt − dϖ/dt = 1222.49362201 − (−0.41897216)
      meanAnomalyRateRadPerCty: degToRad(1222.49362201 - -0.41897216),
      color: SATURN_GOLD,
    },
  },
  // This pole MUST equal SATURN_EQUATORIAL_FRAME's (`orbitPlaneFrames.ts`) — texture and
  // rings ride one equatorial frame, and `rotationElements.test.ts` pins the two equal.
  rotation: {
    id: 'saturn',
    poleRaDeg: 40.589,
    poleDecDeg: 83.537,
    primeMeridianDeg: 38.9,
    spinRateDegPerDay: 810.7939024,
  },
};
