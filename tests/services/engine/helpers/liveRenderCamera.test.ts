/**
 * liveRenderCamera — verifies the epoch-divergence fix's other half: the
 * assembled camera comes from `cameraRuntime.register.pose`, the
 * pivot-corrected pose `runFrame` actually drew, re-merged through the same
 * `assembleOrbitCamera` the frame path uses.
 */
import { describe, it, expect } from 'vitest';

import { liveRenderCamera } from '../../../../src/services/engine/helpers/liveRenderCamera';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const PROJECTION = { fovYRad: 0.9, aspect: 16 / 9, near: 0.01, far: 1e4 };
const UP_BASIS = ORIENTATION_FRAMES.galactic;
const LAST_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: -0.2, distance: 10 };

function makeState(overrides?: { booted?: boolean }): EngineState {
  return {
    booted: overrides?.booted ?? true,
    settings: { orientation: 'galactic' },
    cameraRuntime: {
      register: { pose: absoluteArm(LAST_POSE) },
      outputs: {
        displayed: absoluteArm(LAST_POSE),
        projection: PROJECTION,
        upBasis: UP_BASIS,
        simDays: CONST_J2000,
      },
    },
  } as unknown as EngineState;
}

describe('liveRenderCamera', () => {
  it('returns null before bootstrap', () => {
    expect(liveRenderCamera(makeState({ booted: false }))).toBeNull();
  });

  it('assembles from cameraRuntime.register.pose and the live projection', () => {
    const state = makeState();
    const out = liveRenderCamera(state);

    const expected = assembleOrbitCamera(
      LAST_POSE,
      state.cameraRuntime.outputs.projection,
      ORIENTATION_FRAMES.galactic,
      state.cameraRuntime.outputs.upBasis,
    );
    expect(out).toEqual(expected);
    expect(out!.target).toEqual([1, 2, 3]);
  });
});
