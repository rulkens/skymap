/**
 * galaxyPlannerViewOf — the one rig view the galaxy planner's frame tests hand it: identity
 * COSMO vp at the origin, and a snapshot with no scene bodies and Earth at `earthMpc`
 * (1 Mpc off by default, far too small to occlude anything).
 */

import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';

const IDENTITY = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export function galaxyPlannerViewOf(earthMpc: [number, number, number] = [1, 0, 0]): FrameView {
  return {
    cam: { position: [0, 0, 0] },
    drawCamPos: [0, 0, 0],
    drawPxPerRad: 100,
    slabs: [null, { vp: IDENTITY }],
    snapshot: { sceneBodies: [], bodyStates: new Map([[SCENE_EARTH.id, { positionMpc: earthMpc }]]) },
  } as unknown as FrameView;
}
