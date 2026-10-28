import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { VENUS_CREAM } from '../../../data/bodies/palette';

export const VENUS: LayerBody = {
  body: heliocentricPlanet({
    id: 'venus',
    label: 'Venus',
    datumRadiusM: 6052000,
    albedo: [0.85, 0.8, 0.6],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Venus, heliocentric. JPL: L = 181.97909950°, ϖ = 131.60246718°,
      // Ω = 76.67984255°.
      id: asSceneBodyId('venus'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 0.72333566 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.00677672,
      inclinationRad: degToRad(3.39467605),
      ascendingNodeRad: degToRad(76.67984255),
      // ω = ϖ − Ω = 131.60246718 − 76.67984255
      argPeriapsisRad: degToRad(131.60246718 - 76.67984255),
      // M = L − ϖ = 181.97909950 − 131.60246718
      meanAnomalyRad: degToRad(181.9790995 - 131.60246718),
      // Rates (JPL, per Julian century): dL/dt = 58517.81538729, dϖ/dt = 0.00268329,
      // dΩ/dt = −0.27769418, da/dt = 0.00000390 au, de/dt = −0.00004107, dI/dt = −0.00078890.
      semiMajorRateMpcPerCty: 0.0000039 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: -0.00004107,
      inclinationRateRadPerCty: degToRad(-0.0007889),
      ascendingNodeRateRadPerCty: degToRad(-0.27769418),
      // dω/dt = dϖ/dt − dΩ/dt = 0.00268329 − (−0.27769418)
      argPeriapsisRateRadPerCty: degToRad(0.00268329 - -0.27769418),
      // dM/dt = dL/dt − dϖ/dt = 58517.81538729 − 0.00268329
      meanAnomalyRateRadPerCty: degToRad(58517.81538729 - 0.00268329),
      color: VENUS_CREAM,
    },
  },
  // Retrograde, so Ẇ is negative under the planet convention — contrast Pluto (pluto.ts).
  rotation: {
    id: 'venus',
    poleRaDeg: 272.76,
    poleDecDeg: 67.16,
    primeMeridianDeg: 160.2,
    spinRateDegPerDay: -1.4813688,
  },
};
