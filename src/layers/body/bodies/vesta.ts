import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { smallBody } from './makers/smallBody';
import { degToRad } from '../../../utils/math/degToRad';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { SMALL_BODY_ROCK } from '../../../data/bodies/palette';

// Julian centuries from J2000 to the elements' epoch, JDTDB 2461333.5 (2026-10-20).
const CTY_TO_EPOCH = (2461333.5 - 2451545.0) / 36525;
const NODE_RATE_DEG_PER_CTY = -0.861;
const PERI_RATE_DEG_PER_CTY = 2.037;

export const VESTA: LayerBody = {
  // Appended after Nereid: SCENE_PLANETS is append-only, because a pick decodes to a body by
  // array position (see `bodySelectionRow.ts`'s `resolvePick`).
  body: smallBody({
    id: 'vesta',
    label: 'Vesta',
    datumRadiusM: 261400,
    reliefM: [-49041, 30977], // DSK radius extremes − datum
    albedo: [0.45, 0.43, 0.4],
  }),
  position: {
    kind: 'orbit',
    elements: {
      // Horizons osculating elements (JPL#36, heliocentric, ecliptic J2000) at JDTDB 2461333.5:
      // horizons.api?format=text&COMMAND='4;'&EPHEM_TYPE='ELEMENTS'&CENTER='500@10'
      // &TLIST='2461333.5'&TLIST_TYPE='JD'&TIME_TYPE='TDB'&REF_PLANE='ECLIPTIC'&OUT_UNITS='AU-D'.
      // Ω and ω are carried back to J2000 along their 1900–2100 secular rates; the correction
      // fit absorbs the rest.
      id: asSceneBodyId('vesta'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: 2.361199714781604 * SCALE_UNITS.AU_TO_MPC,
      eccentricity: 0.09023445618156323,
      inclinationRad: degToRad(7.143880727732682),
      ascendingNodeRad: degToRad(103.6995984387553 - NODE_RATE_DEG_PER_CTY * CTY_TO_EPOCH),
      argPeriapsisRad: degToRad(151.4254109736264 - PERI_RATE_DEG_PER_CTY * CTY_TO_EPOCH),
      // MA − N·(epoch − J2000), left unwrapped.
      meanAnomalyRad: degToRad(-2541.6560982404),
      ascendingNodeRateRadPerCty: degToRad(NODE_RATE_DEG_PER_CTY),
      argPeriapsisRateRadPerCty: degToRad(PERI_RATE_DEG_PER_CTY),
      meanAnomalyRateRadPerCty: degToRad(0.2716470485403621 * 36525),
      color: SMALL_BODY_ROCK,
    },
  },
  // The shape model's own frame (`dawn_vesta_grv221108_v1.tpc`, Claudia″), not IAU 2015: the
  // IAU rate is 1.9e-4 °/d slower and drifts 1.1° from the shape by 2026.
  rotation: {
    id: 'vesta',
    poleRaDeg: 309.0611,
    poleDecDeg: 42.2324,
    primeMeridianDeg: 284.6431,
    spinRateDegPerDay: 1617.3331292,
  },
};
