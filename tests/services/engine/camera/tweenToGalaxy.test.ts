/**
 * tweenToGalaxy — unit tests for the camera-tween-to-galaxy helper.
 *
 * `tweenToGalaxy` dispatches `startCameraTween` to the camera Redux slice
 * and wakes the render scheduler. It reads `from` from
 * `state.cameraRuntime.lastPose.current` — the live produced pose — rather
 * than from `state.cam` (the drag register), so mid-tween re-focus hands
 * off from the visible position, not the stale register.
 *
 * The old `tweens.start` dual-write is gone; these tests pin:
 *
 *   - `startCameraTween` is dispatched with the correct from/to descriptor
 *     sourced from `lastPose.current`, not `cam`.
 *   - `scheduler.requestRender()` is called to wake the loop.
 *   - No-op when `state.cam` is null (pre-bootstrap / post-destroy).
 *
 * `galaxyFocusDistance` arithmetic is covered by its own test; these tests
 * only pin the plumbing between `tweenToGalaxy` and the store.
 */

import { describe, it, expect, vi } from 'vitest';

import { tweenToGalaxy } from '../../../../src/services/engine/camera/tweenToGalaxy';
import { galaxyFocusDistance } from '../../../../src/services/engine/camera/galaxyFocusDistance';
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { AppStore } from '../../../../src/store/types';
import type { AppDispatch } from '../../../../src/store/types';

/** Build a minimal EngineState fixture with the fields `tweenToGalaxy` reads. */
function makeState(opts: {
  cam?: { yaw: number; pitch: number } | null;
  lastPose?: CameraPose;
  requestRender?: ReturnType<typeof vi.fn>;
}): EngineState {
  const lastPose: CameraPose = opts.lastPose ?? {
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: 10,
  };
  return {
    cam: opts.cam === undefined ? ({ yaw: 0, pitch: 0 } as unknown) : opts.cam,
    cameraRuntime: {
      lastPose: { current: lastPose },
    },
    subsystems: {
      scheduler: { requestRender: opts.requestRender ?? vi.fn() },
    },
  } as unknown as EngineState;
}

function makeStore(): { store: AppStore; dispatch: ReturnType<typeof vi.fn<AppDispatch>> } {
  const dispatch = vi.fn<AppDispatch>();
  const store = { dispatch, getState: () => ({}) } as unknown as AppStore;
  return { store, dispatch };
}

describe('tweenToGalaxy', () => {
  it('dispatches startCameraTween with to.target = [x, y, z] and to.distance = galaxyFocusDistance(diameterKpc)', () => {
    const state = makeState({});
    const { store, dispatch } = makeStore();

    tweenToGalaxy(state, { x: 100, y: 200, z: 300, diameterKpc: 25 }, store);

    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0]![0] as { type: string; payload: unknown };
    expect(action.type).toBe('camera/startCameraTween');
    const payload = action.payload as {
      from: CameraPose;
      to: CameraPose;
      durationMs: number;
      easing: string;
    };
    expect(payload.to.target).toEqual([100, 200, 300]);
    expect(payload.to.distance).toBe(galaxyFocusDistance(25));
    expect(payload.durationMs).toBe(FOCUS_TWEEN_MS);
    expect(payload.easing).toBe('easeOutCubic');
  });

  it('reads `from` from cameraRuntime.lastPose.current, not state.cam', () => {
    // lastPose.current is the live produced pose (may differ from cam mid-tween).
    const lastPose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: -0.2, distance: 77 };
    const state = makeState({ lastPose });
    const { store, dispatch } = makeStore();

    tweenToGalaxy(state, { x: 0, y: 0, z: 0, diameterKpc: 30 }, store);

    const payload = (dispatch.mock.calls[0]![0] as unknown as { payload: { from: CameraPose } }).payload;
    expect(payload.from).toEqual(lastPose);
  });

  it('preserves from.yaw and from.pitch as to.yaw and to.pitch (only target + distance change)', () => {
    const lastPose: CameraPose = { target: [0, 0, 0], yaw: 1.23, pitch: -0.45, distance: 50 };
    const state = makeState({ lastPose });
    const { store, dispatch } = makeStore();

    tweenToGalaxy(state, { x: 10, y: 20, z: 30, diameterKpc: 10 }, store);

    const payload = (
      dispatch.mock.calls[0]![0] as unknown as { payload: { to: CameraPose } }
    ).payload;
    // Yaw and pitch of `to` inherit from the live produced pose — orientation
    // is preserved across the focus jump; only target and distance change.
    expect(payload.to.yaw).toBe(1.23);
    expect(payload.to.pitch).toBe(-0.45);
  });

  it('calls scheduler.requestRender() to wake the render loop', () => {
    const requestRender = vi.fn<() => void>();
    const state = makeState({ requestRender });
    const { store } = makeStore();

    tweenToGalaxy(state, { x: 0, y: 0, z: 0, diameterKpc: 20 }, store);

    expect(requestRender).toHaveBeenCalledOnce();
  });

  it('is a no-op when state.cam is null (pre-bootstrap / post-destroy)', () => {
    const requestRender = vi.fn<() => void>();
    const state = makeState({ cam: null, requestRender });
    const { store, dispatch } = makeStore();

    tweenToGalaxy(state, { x: 100, y: 200, z: 300, diameterKpc: 25 }, store);

    expect(dispatch).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
