/**
 * aerialPerspectivePass — the inside-the-shell half of the atmosphere split.
 * `enabled` IS the contract: exactly one of this row and `atmosphere-shell`
 * may draw a body in one frame, or that body's in-scatter is applied twice.
 * The pose's eye, which `inside` is measured off, is the one input varied here.
 */

import { describe, it, expect, vi } from 'vitest';

import { aerialPerspectivePass } from '../../../../src/layers/body/passes/aerialPerspectivePass';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SceneBodyId } from '../../../../src/@types/scene/SceneBodyId';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { BodyRelativePose } from '../../../../src/@types/engine/camera/BodyRelativePose';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// Well under / well over the 1.005 × atmosphere-top band edge (~6,500 km at Earth).
const EYE_INSIDE_M: Vec3 = [0, 0, 1e6];
const EYE_OUTSIDE_M: Vec3 = [0, 0, 2e7];

// Earth a hair off the render origin: far enough from the sub-pixel cull that
// only `inside` decides the row, close enough that no pose magnitude is large.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: () =>
    seededBodyStates(0, [
      {
        ...SCENE_EARTH,
        positionMpc: [-1e-15, 0, 0],
        orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'],
      },
    ]),
}));

// 720-px viewport, 60° fovY, tangent-exact — the apparent-size gate's scale.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));

/** A fresh ctx per call: `atmosphereDrawList` memoises on the ctx object. */
function makeCtx(eyeRelBodyM: Vec3): FrameView {
  const pose: BodyRelativePose = {
    eyeRelBodyM,
    basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyRelativePose['basisM'],
  };
  return {
    cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
    drawCamPos: [0, 0, 0],
    bodyPose: (() => pose) as FrameView['bodyPose'],
    drawPxPerRad: FIXTURE_PX_PER_RAD,
  } as unknown as FrameView;
}

function makeBodyView(bodyId: SceneBodyId): SlabView {
  return {
    slab: makeSlab({ frame: { kind: 'body-m', hostId: bodyId } }),
    vp: new Float32Array(16),
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
    window: { originPx: [0, 0], sizePx: [1280, 720] },
  };
}

const STATE = {} as unknown as EngineState;

describe('aerialPerspectivePass.enabled', () => {
  it('is true only for a body whose shell encloses the camera', () => {
    const pass = aerialPerspectivePass({
      atmosphereShellRenderer: { drawAerialPerspective: vi.fn() },
    } as unknown as BodyRuntime);
    const view = makeBodyView(asSceneBodyId('earth'));

    expect(pass.enabled(STATE, makeCtx(EYE_INSIDE_M), view)).toBe(true);

    // Outside, the proxy-mesh `atmosphere-shell` row owns this body instead.
    expect(pass.enabled(STATE, makeCtx(EYE_OUTSIDE_M), view)).toBe(false);
  });
});
