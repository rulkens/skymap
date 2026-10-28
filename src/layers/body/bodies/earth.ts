import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { BODY_GLINT_MAX_PX } from '../../../data/bodies/bodyGlintMaxPx';
import { EARTH_DATUM_RADIUS_M } from '../../../data/bodies/earthDatumRadiusM';
import { EARTH_BLUE } from '../../../data/bodies/palette';

// Earth keeps this bespoke record rather than going through `heliocentricPlanet`: an
// `EarthBody` carries no flat `albedo` (it is always textured, the Blue Marble riding
// the keyed `bodyTextures` slot family), where a `PlanetBody` carries one.
export const EARTH: LayerBody = {
  body: {
    id: asSceneBodyId('earth'),
    label: 'Earth',
    // Mariana Trench to Everest, against the WGS84-ish datum (EARTH_DATUM_RADIUS_M, spec §7.4).
    surface: { datumRadiusM: EARTH_DATUM_RADIUS_M, reliefM: [-430, 8849] },
    resolvePx: BODY_GLINT_MAX_PX,
  },
  position: {
    kind: 'orbit',
    elements: {
      // Earth–Moon barycenter, heliocentric. JPL: L = 100.46457166°,
      // ϖ = 102.93768193°, Ω = 0.0°.
      id: asSceneBodyId('earth'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 1.00000261 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.01671123,
      inclinationRad: degToRad(-0.00001531),
      ascendingNodeRad: degToRad(0.0),
      // ω = ϖ − Ω = 102.93768193 − 0.0
      argPeriapsisRad: degToRad(102.93768193 - 0.0),
      // M = L − ϖ = 100.46457166 − 102.93768193
      meanAnomalyRad: degToRad(100.46457166 - 102.93768193),
      // Rates (JPL, per Julian century): dL/dt = 35999.37244981, dϖ/dt = 0.32327364,
      // dΩ/dt = 0.0, da/dt = 0.00000562 au, de/dt = −0.00004392, dI/dt = −0.01294668.
      semiMajorRateMpcPerCty: 0.00000562 * SCALE_UNITS.AU_TO_MPC,
      eccentricityRatePerCty: -0.00004392,
      inclinationRateRadPerCty: degToRad(-0.01294668),
      ascendingNodeRateRadPerCty: degToRad(0.0),
      // dω/dt = dϖ/dt − dΩ/dt = 0.32327364 − 0.0
      argPeriapsisRateRadPerCty: degToRad(0.32327364 - 0.0),
      // dM/dt = dL/dt − dϖ/dt = 35999.37244981 − 0.32327364
      meanAnomalyRateRadPerCty: degToRad(35999.37244981 - 0.32327364),
      color: EARTH_BLUE,
    },
  },
  // LANDMINE — Archinal's own Earth W (190.147 + 360.9856235·d) is in TDB days, and the
  // sim clock is UTC: fed UTC it put Greenwich 0.2–0.3° (23–35 km) west. W is instead the
  // IERS Earth Rotation Angle (UT1 ≈ UTC), ERA = 280.46061837504 + 360.98561228808761·d,
  // less 90° + α₀(t): `rotationFromIau` measures W from the node at α₀ + 90°, so the
  // −0.641°/cy α̇ adds 0.641/36525 °/day to Ẇ. The pole rates are the IAU precession.
  rotation: {
    id: 'earth',
    poleRaDeg: 0.0,
    poleDecDeg: 90.0,
    poleRaRateDegPerCty: -0.641,
    poleDecRateDegPerCty: -0.557,
    primeMeridianDeg: 190.46061837504,
    spinRateDegPerDay: 360.98562983768,
  },
};
