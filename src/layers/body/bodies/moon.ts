import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { satelliteBody } from './makers/satelliteBody';
import { degToRad } from '../../../utils/math/degToRad';
import { moonRatesFromSiderealPeriods } from '../../../utils/orbit/moonRatesFromSiderealPeriods';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { MOON_GREY } from '../../../data/bodies/palette';

export const MOON: LayerBody = {
  body: satelliteBody({
    id: 'moon',
    label: 'Moon',
    datumRadiusM: 1737000,
    albedo: [0.35, 0.34, 0.33],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // The Moon, geocentric. JPL sats/elem (ecliptic frame, epoch 2000-01-01.5 TDB, DE405/LE405):
      // a=384400 km, e=0.0554, i=5.16°, node Ω=125.08°, ω=318.15°, M=135.27°, P=27.322 d,
      // Papsis=5.997 yr, Pnode=18.600 yr — ω and M given directly, no ϖ/L derivation.
      // LANDMINE — the Moon's P is the SIDEREAL month, where the planetary satellites' P (their
      // satellite() rows) is the mean-anomaly period (the anomalistic month is 27.5545 d), hence
      // the sidereal rate conversion: 2π/P is the mean-LONGITUDE rate and dM/dt is that minus both
      // precession rates. Read 27.322 d as the M-period and the apsidal advance is double-counted
      // into longitude: +0.111°/day = 40.6°/yr of phase drift, a Moon 102° off the Sun at the real
      // 2024-04-08 eclipse (see the eclipse regression test). Papsis is the ARGUMENT-of-periapsis period, ω
      // relative to the regressing node: 360/(360/8.85 + 360/18.6) = 5.997, consistent with the
      // familiar 8.85 yr perigee (longitude ϖ) and 18.6 yr node. Prograde, so apsis advances (+)
      // and node regresses (−). Ecliptic-framed, so `plane` is omitted.
      id: asSceneBodyId('moon'),
      focusId: asSceneBodyId('earth'),
      semiMajorMpc: 384400 * SCALE_UNITS.KM_TO_MPC,
      eccentricity: 0.0554,
      inclinationRad: degToRad(5.16),
      ascendingNodeRad: degToRad(125.08),
      argPeriapsisRad: degToRad(318.15),
      meanAnomalyRad: degToRad(135.27),
      ...moonRatesFromSiderealPeriods({
        siderealPeriodDays: 27.322,
        apsidalPrecessionYears: 5.997,
        nodalPrecessionYears: 18.6,
      }),
      color: MOON_GREY,
    },
  },
  rotation: {
    id: 'moon',
    poleRaDeg: 269.9949,
    poleDecDeg: 66.5392,
    primeMeridianDeg: 38.3213,
    spinRateDegPerDay: 13.17635815,
  },
};
