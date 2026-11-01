import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { heliocentricPlanet } from './makers/heliocentricPlanet';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { PLUTO_TAN } from '../../../data/bodies/palette';

export const PLUTO: LayerBody = {
  // Appended after Iapetus rather than filed with the other heliocentric bodies:
  // SCENE_PLANETS is append-only, because a pick decodes to a body by array
  // position (see `bodySelectionRow.ts`'s `resolvePick`).
  body: heliocentricPlanet({
    id: 'pluto',
    label: 'Pluto',
    datumRadiusM: 1188300, // WGCCRE 2015 (Archinal+18), from New Horizons (Nimmo+17).
    albedo: [0.55, 0.5, 0.42],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Pluto, heliocentric. Same Table 1 as the other planets' rows (mercury.ts … neptune.ts),
      // but read from its reprint in the Explanatory Supplement to the Astronomical Almanac, 3rd
      // ed. (2013), §8.10 Table 8.10.2 — the approx_pos.html web edition dropped Pluto and the PDF
      // it replaced now redirects there. L = 238.92903833°, ϖ = 224.06891629°, Ω = 110.30393684°.
      id: asSceneBodyId('pluto'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 39.48211675 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.2488273,
      inclinationRad: degToRad(17.14001206),
      ascendingNodeRad: degToRad(110.30393684),
      // ω = ϖ − Ω = 224.06891629 − 110.30393684
      argPeriapsisRad: degToRad(224.06891629 - 110.30393684),
      // M = L − ϖ = 238.92903833 − 224.06891629
      meanAnomalyRad: degToRad(238.92903833 - 224.06891629),
      // Rates (JPL, per Julian century): dL/dt = 145.20780515, dϖ/dt = −0.04062942,
      // dΩ/dt = −0.01183482, da/dt = −0.00031596 au, de/dt = 0.00005170, dI/dt = 0.00004818.
      semiMajorRateMpcPerCty: -0.00031596 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: 0.0000517,
      inclinationRateRadPerCty: degToRad(0.00004818),
      ascendingNodeRateRadPerCty: degToRad(-0.01183482),
      // dω/dt = dϖ/dt − dΩ/dt = −0.04062942 − (−0.01183482)
      argPeriapsisRateRadPerCty: degToRad(-0.04062942 - -0.01183482),
      // dM/dt = dL/dt − dϖ/dt = 145.20780515 − (−0.04062942)
      meanAnomalyRateRadPerCty: degToRad(145.20780515 - -0.04062942),
      color: PLUTO_TAN,
    },
  },
  // Pluto and Charon come from NAIF pck00011.tpc (BODY999/BODY901), not the Archinal+18 tables
  // the other bodies' rotation rows use. Minor-body pole convention: the "positive" pole, so Ẇ is
  // positive despite the retrograde spin — unlike Uranus/Venus (uranus.ts, venus.ts), which keep
  // the planet convention and go negative.
  rotation: {
    id: 'pluto',
    poleRaDeg: 132.993,
    poleDecDeg: -6.163,
    primeMeridianDeg: 302.695,
    spinRateDegPerDay: 56.3625225,
  },
};
