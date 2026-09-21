/**
 * frameContextInputOf — the shared EngineState→FrameContextInput recipe
 * `runFrame` and `pickFrameContext` both call. The one property worth pinning:
 * for the SAME state and the SAME world pose, the two callers' shapes of
 * "deliberate difference" arguments must still agree on every field neither
 * one varies — `arm` and `altitudeMpc` above all, since a drift there is
 * exactly the bug class this recipe exists to prevent (NEAR0's bracket
 * differing between what a frame draws and what a click picks, at grazing
 * altitude).
 */

import { describe, it, expect } from 'vitest';

import { frameContextInputOf } from '../../../../src/services/engine/frame/frameContextInputOf';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';

const WORLD_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
const PROJECTION: CameraProjection = { fovYRad: 1.2, aspect: 16 / 9, near: 0.1, far: 10000 };

function makeState(): EngineState {
  return {
    settings: { orientation: 'equatorial' },
    selectionRows: { hover: null, select: null, focus: null },
    cameraRuntime: {
      outputs: {
        displayed: absoluteArm(WORLD_POSE),
        projection: PROJECTION,
      },
    },
  } as unknown as EngineState;
}

describe('frameContextInputOf', () => {
  it("draw-shaped and pick-shaped calls over the SAME state and world pose agree on arm, altitudeMpc and the pose-true camera — only the caller's own named differences move", () => {
    const state = makeState();
    const basis = ORIENTATION_FRAMES.equatorial;

    const draw = frameContextInputOf(state, {
      worldPose: WORLD_POSE,
      nowMs: 1000,
      visibleSourceMask: 0b1111,
      upBasis: basis,
      simDays: 111,
    });
    const pick = frameContextInputOf(state, {
      worldPose: WORLD_POSE,
      nowMs: 2000,
      visibleSourceMask: 0b0001,
      upBasis: basis,
      simDays: 222,
    });

    // Never varies between the two callers: the eye→pivot-surface bracket and
    // the displayed arm are read off the SAME state, not re-derived per caller.
    expect(pick.input.altitudeMpc).toBe(draw.input.altitudeMpc);
    expect(pick.input.arm).toBe(draw.input.arm);
    // The pose-true camera's shared fields (everything but upBasis, which the
    // caller supplies): same position, orientation and projection either way.
    expect(pick.cam.position).toEqual(draw.cam.position);
    expect(pick.cam.target).toEqual(draw.cam.target);
    expect(pick.cam.distance).toBe(draw.cam.distance);
    expect(pick.cam.poseBasis).toEqual(draw.cam.poseBasis);
    expect(pick.cam.fovYRad).toBe(draw.cam.fovYRad);
    expect(pick.cam.aspect).toBe(draw.cam.aspect);

    // Only the declared differences actually differ.
    expect(pick.input.nowMs).not.toBe(draw.input.nowMs);
    expect(pick.input.visibleSourceMask).not.toBe(draw.input.visibleSourceMask);
    expect(pick.input.simDays).not.toBe(draw.input.simDays);
  });
});
