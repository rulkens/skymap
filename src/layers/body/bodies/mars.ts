import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { MARS_RED } from '../../../data/bodies/palette';
import {
  MARS_AREOID_RELIEF_M,
  MARS_DATUM_OFFSET_M,
  MARS_DATUM_RADIUS_M,
} from '../../../data/bodies/marsSurfaceParams';

export const MARS: LayerBody = {
  body: heliocentricPlanet({
    id: 'mars',
    label: 'Mars',
    datumRadiusM: MARS_DATUM_RADIUS_M,
    albedo: [0.6, 0.32, 0.23],
    reliefM: [
      MARS_AREOID_RELIEF_M[0] + MARS_DATUM_OFFSET_M,
      MARS_AREOID_RELIEF_M[1] + MARS_DATUM_OFFSET_M,
    ],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Mars, heliocentric. JPL: L = −4.55343205°, ϖ = −23.94362959°,
      // Ω = 49.55953891°.
      id: asSceneBodyId('mars'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 1.52371034 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.0933941,
      inclinationRad: degToRad(1.84969142),
      ascendingNodeRad: degToRad(49.55953891),
      // ω = ϖ − Ω = −23.94362959 − 49.55953891
      argPeriapsisRad: degToRad(-23.94362959 - 49.55953891),
      // M = L − ϖ = −4.55343205 − (−23.94362959)
      meanAnomalyRad: degToRad(-4.55343205 - -23.94362959),
      // Rates (JPL, per Julian century): dL/dt = 19140.30268499, dϖ/dt = 0.44441088,
      // dΩ/dt = −0.29257343, da/dt = 0.00001847 au, de/dt = 0.00007882, dI/dt = −0.00813131.
      semiMajorRateMpcPerCty: 0.00001847 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: 0.00007882,
      inclinationRateRadPerCty: degToRad(-0.00813131),
      ascendingNodeRateRadPerCty: degToRad(-0.29257343),
      // dω/dt = dϖ/dt − dΩ/dt = 0.44441088 − (−0.29257343)
      argPeriapsisRateRadPerCty: degToRad(0.44441088 - -0.29257343),
      // dM/dt = dL/dt − dϖ/dt = 19140.30268499 − 0.44441088
      meanAnomalyRateRadPerCty: degToRad(19140.30268499 - 0.44441088),
      color: MARS_RED,
    },
  },
  // `orbitPlaneFrames.ts` carries the same pole rounded to 317.681/52.887.
  rotation: {
    id: 'mars',
    poleRaDeg: 317.68143,
    poleDecDeg: 52.8865,
    primeMeridianDeg: 176.63,
    spinRateDegPerDay: 350.89198226,
  },
};
