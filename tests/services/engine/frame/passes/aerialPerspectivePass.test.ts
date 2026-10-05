/**
 * aerialPerspectivePass — the inside-the-shell half of the atmosphere split.
 * `enabled` IS the contract: exactly one of this row and `atmosphere-shell`
 * may draw a body in one frame, or that body's in-scatter is applied twice.
 * The camera-local position `atmosphereDrawList` derives `inside` from is the
 * one input mocked here; its own math has its own test file.
 */

import { describe, it, expect, vi } from 'vitest';

import { aerialPerspectivePass } from '../../../../../src/services/engine/frame/passes/aerialPerspectivePass';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { BodyRelativePose } from '../../../../../src/@types/engine/camera/BodyRelativePose';

// Well under / well over `isInsideAtmosphereShell`'s 1.005 ratio, in the
// shell's atmosphere-top-radius frame.
const CAM_LOCAL_INSIDE: Vec3 = [0, 0, 0.5];
const CAM_LOCAL_OUTSIDE: Vec3 = [1, 2, 3];

const mocked = vi.hoisted(() => ({ camLocal: [0, 0, 0.5] as [number, number, number] }));
vi.mock('../../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: (): Vec3 => mocked.camLocal,
}));
// Earth a hair off the render origin: far enough from the sub-pixel cull that
// only `inside` decides the row, close enough that no pose magnitude is large.
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: () =>
    new Map([
      [
        'earth',
        {
          positionMpc: [-1e-15, 0, 0],
          orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          meanAnomalyRad: 0,
        },
      ],
    ]),
}));

// 720-px viewport, 60° fovY, tangent-exact — the apparent-size gate's scale.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));

const STUB_POSE: BodyRelativePose = {
  eyeRelBodyM: [1, 2, 3],
  basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyRelativePose['basisM'],
};

/** A fresh ctx per call: `atmosphereDrawList` memoises on the ctx object. */
function makeCtx(): FrameView {
  return {
    cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
    drawCamPos: [0, 0, 0],
    bodyPose: (() => STUB_POSE) as FrameView['bodyPose'],
    drawPxPerRad: FIXTURE_PX_PER_RAD,
  } as unknown as FrameView;
}

function makeBodyView(bodyId: BodyId): SlabView {
  return {
    slab: makeSlab({ frame: { kind: 'body-m', hostId: bodyId } }),
    vp: new Float32Array(16),
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
  };
}

function makeState(renderer: unknown): EngineState {
  return {
    gpu: { atmosphereShellRenderer: renderer },
    data: { bodies: { earth: SCENE_EARTH, planets: [] } },
  } as unknown as EngineState;
}

describe('aerialPerspectivePass.enabled', () => {
  it('is true only for a body whose shell encloses the camera', () => {
    const state = makeState({ drawAerialPerspective: vi.fn() });
    const view = makeBodyView('earth' as BodyId);

    mocked.camLocal = CAM_LOCAL_INSIDE;
    expect(aerialPerspectivePass.enabled(state, makeCtx(), view)).toBe(true);

    // Outside, the proxy-mesh `atmosphere-shell` row owns this body instead.
    mocked.camLocal = CAM_LOCAL_OUTSIDE;
    expect(aerialPerspectivePass.enabled(state, makeCtx(), view)).toBe(false);
  });

  it('is false while the atmosphereShellRenderer handle is null, even for a bare ctx', () => {
    mocked.camLocal = CAM_LOCAL_INSIDE;
    expect(
      aerialPerspectivePass.enabled(
        makeState(null),
        {} as FrameView,
        makeBodyView('earth' as BodyId),
      ),
    ).toBe(false);
  });
});
