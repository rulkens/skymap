import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { smallBody } from './makers/smallBody';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { SMALL_BODY_ROCK } from '../../../data/bodies/palette';

// Julian centuries from J2000 to the elements' epoch, JDTDB 2461333.5 (2026-10-20).
const CTY_TO_EPOCH = (2461333.5 - 2451545.0) / 36525;
const NODE_RATE_DEG_PER_CTY = -1.4529;
const PERI_RATE_DEG_PER_CTY = 2.6639;

export const CERES: LayerBody = {
  // Appended after Vesta: SCENE_PLANETS is append-only (a pick decodes by array position).
  body: smallBody({
    id: 'ceres',
    label: 'Ceres',
    datumRadiusM: 469700,
    reliefM: [-27282, 17313], // DSK radius extremes − datum
    albedo: [0.3, 0.29, 0.28],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Horizons osculating elements (JPL#48, heliocentric, ecliptic J2000) at JDTDB 2461333.5:
      // horizons.api?format=text&COMMAND='1;'&EPHEM_TYPE='ELEMENTS'&CENTER='500@10'
      // &TLIST='2461333.5'&TLIST_TYPE='JD'&TIME_TYPE='TDB'&REF_PLANE='ECLIPTIC'&OUT_UNITS='AU-D'.
      // Ω and ω are carried back to J2000 along their 1900–2100 secular rates; the correction
      // fit absorbs the rest.
      id: asSceneBodyId('ceres'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 2.766141043028709 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.07978996792436145,
      inclinationRad: degToRad(10.5871434312285),
      ascendingNodeRad: degToRad(80.24883443379728 - NODE_RATE_DEG_PER_CTY * CTY_TO_EPOCH),
      argPeriapsisRad: degToRad(73.16151016629702 - PERI_RATE_DEG_PER_CTY * CTY_TO_EPOCH),
      // MA − N·(epoch − J2000), left unwrapped.
      meanAnomalyRad: degToRad(-1793.9942367995),
      ascendingNodeRateRadPerCty: degToRad(NODE_RATE_DEG_PER_CTY),
      argPeriapsisRateRadPerCty: degToRad(PERI_RATE_DEG_PER_CTY),
      meanAnomalyRateRadPerCty: degToRad(0.2142360700153075 * 36525),
      color: SMALL_BODY_ROCK,
    },
  },
  // IAU 2015 (pck00011 BODY2000001); the Dawn gravity team's frame differs by 0.28° at 2026.
  rotation: {
    id: 'ceres',
    poleRaDeg: 291.418,
    poleDecDeg: 66.764,
    primeMeridianDeg: 170.65,
    spinRateDegPerDay: 952.1532,
  },
};
