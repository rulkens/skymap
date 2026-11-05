/**
 * flowBasinOrbit — the measured flow field around Laniakea, orbited once at
 * constant speed: rotation is what turns the streamlines from a flat tangle
 * into a 3D basin draining toward the Great Attractor. One linear revolution,
 * so the last frame meets the first and the video loops.
 */

import type { Clip } from '../../@types/animation/Clip';
import type { Vec3 } from '../../@types/math/Vec3';
import {
  fade,
  fork,
  hide,
  oscillate,
  scene,
  spin,
} from '../../services/engine/animation/effectHelpers';
import { setFlowEnabled } from '../../layers/flow/state/flow/slice';

const PERIOD_SEC = 32;

export const flowBasinOrbit: Clip = {
  id: 'flowBasinOrbit',
  label: 'Flow basin orbit',
  data: {
    // The `cosmicFlows` clip's bearing, out at the basin's scale.
    start: { target: [0, -0.01, 0] as Vec3, yaw: -1.7455, pitch: -0.3589, distance: 520 },
    timeline: [
      hide(['cosmicWebDensity', 'cosmicWebFilaments', 'label:famousGalaxy', 'zoneOfAvoidance'], 0),
      fade(['survey'], 0, 0),
      scene(setFlowEnabled(true)),
      fork(oscillate('pitch', { amp: 0.12, period: PERIOD_SEC })),
      spin('yaw', { by: Math.PI * 2, over: PERIOD_SEC, ease: 'linear' }),
    ],
  },
};
