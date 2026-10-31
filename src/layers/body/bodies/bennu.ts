import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { smallBody } from './makers/smallBody';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { SMALL_BODY_ROCK } from '../../../data/bodies/palette';

// Julian centuries from J2000 to the elements' epoch, JDTDB 2461333.5 (2026-10-20).
const CTY_TO_EPOCH = (2461333.5 - 2451545.0) / 36525;
const NODE_RATE_DEG_PER_CTY = -1.3496;
const PERI_RATE_DEG_PER_CTY = 3.0156;

export const BENNU: LayerBody = {
  // Appended after Ceres: SCENE_PLANETS is append-only (a pick decodes by array position).
  body: smallBody({
    id: 'bennu',
    label: 'Bennu',
    datumRadiusM: 242,
    reliefM: [-29, 50], // DSK radius extremes − datum
    albedo: [0.24, 0.23, 0.22],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Horizons osculating elements (record 2101955, the OSIRIS-REx solution; heliocentric,
      // ecliptic J2000) at JDTDB 2461333.5:
      // horizons.api?format=text&COMMAND='101955;'&EPHEM_TYPE='ELEMENTS'&CENTER='500@10'
      // &TLIST='2461333.5'&TLIST_TYPE='JD'&TIME_TYPE='TDB'&REF_PLANE='ECLIPTIC'&OUT_UNITS='AU-D'.
      // A fixed conic loses Bennu within decades (Earth encounters shift its n); the
      // correction fit carries it across 2007–2054 only and holds outside.
      id: asSceneBodyId('bennu'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 1.125916959208119 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.2036757328642475,
      inclinationRad: degToRad(6.033002899161105),
      ascendingNodeRad: degToRad(1.966283774222238 - NODE_RATE_DEG_PER_CTY * CTY_TO_EPOCH),
      argPeriapsisRad: degToRad(66.40096674623172 - PERI_RATE_DEG_PER_CTY * CTY_TO_EPOCH),
      // MA − N·(epoch − J2000), left unwrapped.
      meanAnomalyRad: degToRad(-7893.151761351),
      ascendingNodeRateRadPerCty: degToRad(NODE_RATE_DEG_PER_CTY),
      argPeriapsisRateRadPerCty: degToRad(PERI_RATE_DEG_PER_CTY),
      meanAnomalyRateRadPerCty: degToRad(0.8249821136016373 * 36525),
      color: SMALL_BODY_ROCK,
    },
  },
  // `bennu_v17.tpc` (OSIRIS-REx; Bennu is not in the IAU report). Minor-body positive pole, so
  // Ẇ is positive despite the retrograde spin, as Pluto. The PCK's YORP term W₂ = 2.0e-6 °/d² is
  // linearised about 2026-10-20 (W₀′ = W₀ − W₂d², Ẇ′ = W₁ + 2W₂d): 27° off at ±10 yr.
  rotation: {
    id: 'bennu',
    poleRaDeg: 85.45864,
    poleDecDeg: -60.36468,
    primeMeridianDeg: 318.8603,
    spinRateDegPerDay: 2011.1822127,
  },
};
