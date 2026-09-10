/**
 * liveRenderCamera — verifies the epoch-divergence fix's other half: the
 * assembled camera comes from `cameraRuntime.register.pose` (the pivot-corrected
 * pose `runFrame` actually drew), NOT `state.cam` (the drag register that
 * `frameContext.ts`'s header documents as stale between gestures). The test
 * pins `state.cam`'s orbit params to a value that visibly disagrees with
 * `register.pose` — the exact shape of the bug the investigation found — and
 * asserts the live pose wins.
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

function makeState(overrides?: { cam?: unknown }): EngineState {
  return {
    cam:
      overrides && 'cam' in overrides
        ? overrides.cam
        : {
            // A stale drag-register pose — different target/yaw/pitch/distance
            // from cameraRuntime.register.pose below, standing in for "last gesture
            // start, long ago".
            target: [999, 999, 999],
            yaw: 3,
            pitch: 1,
            distance: 500,
            poseBasis: ORIENTATION_FRAMES.equatorial,
            upBasis: ORIENTATION_FRAMES.equatorial,
            fovYRad: 0.9,
            aspect: 16 / 9,
            near: 0.01,
            far: 1e4,
            position: [0, 0, 500],
          },
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
  it('returns null before bootstrap (state.cam null)', () => {
    expect(liveRenderCamera(makeState({ cam: null }))).toBeNull();
  });

  it("assembles from cameraRuntime.register.pose, not state.cam's stale orbit params", () => {
    const state = makeState();
    const out = liveRenderCamera(state);

    const expected = assembleOrbitCamera(
      LAST_POSE,
      state.cameraRuntime.outputs.projection,
      ORIENTATION_FRAMES.galactic,
      state.cameraRuntime.outputs.upBasis,
    );
    expect(out).toEqual(expected);
    // The regression this guards: the stale state.cam target must NOT leak
    // into the result.
    expect(out!.target).not.toEqual([999, 999, 999]);
    expect(out!.target).toEqual([1, 2, 3]);
  });
});
