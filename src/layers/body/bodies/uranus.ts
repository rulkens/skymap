import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { URANUS_CYAN } from '../../../data/bodies/palette';

export const URANUS: LayerBody = {
  body: heliocentricPlanet({
    id: 'uranus',
    label: 'Uranus',
    datumRadiusM: 25362000,
    albedo: [0.6, 0.8, 0.82],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Uranus, heliocentric. JPL: L = 313.23810451°, ϖ = 170.95427630°,
      // Ω = 74.01692503°.
      id: asSceneBodyId('uranus'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 19.18916464 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.04725744,
      inclinationRad: degToRad(0.77263783),
      ascendingNodeRad: degToRad(74.01692503),
      // ω = ϖ − Ω = 170.95427630 − 74.01692503
      argPeriapsisRad: degToRad(170.9542763 - 74.01692503),
      // M = L − ϖ = 313.23810451 − 170.95427630
      meanAnomalyRad: degToRad(313.23810451 - 170.9542763),
      // Rates (JPL, per Julian century): dL/dt = 428.48202785, dϖ/dt = 0.40805281,
      // dΩ/dt = 0.04240589, da/dt = −0.00196176 au, de/dt = −0.00004397, dI/dt = −0.00242939.
      semiMajorRateMpcPerCty: -0.00196176 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: -0.00004397,
      inclinationRateRadPerCty: degToRad(-0.00242939),
      ascendingNodeRateRadPerCty: degToRad(0.04240589),
      // dω/dt = dϖ/dt − dΩ/dt = 0.40805281 − 0.04240589
      argPeriapsisRateRadPerCty: degToRad(0.40805281 - 0.04240589),
      // dM/dt = dL/dt − dϖ/dt = 428.48202785 − 0.40805281
      meanAnomalyRateRadPerCty: degToRad(428.48202785 - 0.40805281),
      color: URANUS_CYAN,
    },
  },
  // Retrograde, and δ₀ is genuinely negative: the invariable-plane convention puts the
  // IAU north pole south of the ecliptic. Authored as published, not sign-flipped.
  rotation: {
    id: 'uranus',
    poleRaDeg: 257.311,
    poleDecDeg: -15.175,
    primeMeridianDeg: 203.81,
    spinRateDegPerDay: -501.1600928,
  },
};
