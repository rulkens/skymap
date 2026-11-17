/**
 * The orbiting probe sphere: a circular ISS-like orbit 500 km up, so its probe sees Earth
 * filling one hemisphere and black sky the other.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { probeSphereBody } from './makers/probeSphereBody';
import { planeFrameFromPole } from '../../../data/bodies/orbitPlaneFrames';
import { EARTH_GM_KM3_S2 } from '../../../data/earthGmKm3S2';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SECONDS_PER_DAY } from '../../../data/time/secondsPerDay';
import { DAYS_PER_JULIAN_CENTURY } from '../../../data/time/daysPerJulianCentury';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { degToRad } from '../../../utils/math/degToRad';

// 500 km above Earth's 6378 km equatorial radius.
const SEMI_MAJOR_KM = 6878;
const MEAN_MOTION_RAD_PER_S = Math.sqrt(EARTH_GM_KM3_S2 / SEMI_MAJOR_KM ** 3);

export const PROBE_SPHERE_ORBIT: LayerBody = {
  body: probeSphereBody('probe-sphere-orbit', 'Probe sphere (orbit)'),
  position: {
    kind: 'orbit',
    elements: {
      id: asSceneBodyId('probe-sphere-orbit'),
      focusId: asSceneBodyId('earth'),
      semiMajorMpc: SEMI_MAJOR_KM * SCALE_UNITS.KM_TO_MPC,
      eccentricity: 0,
      inclinationRad: degToRad(51.6),
      ascendingNodeRad: 0,
      argPeriapsisRad: 0,
      meanAnomalyRad: 0,
      meanAnomalyRateRadPerCty: MEAN_MOTION_RAD_PER_S * SECONDS_PER_DAY * DAYS_PER_JULIAN_CENTURY,
      color: [0.5, 0.5, 0.5],
      // Inclination from the celestial equator, as Horizons' FRAME (see `orbiter`).
      plane: planeFrameFromPole(270, 90),
    },
  },
};
