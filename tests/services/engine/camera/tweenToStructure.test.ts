/**
 * tweenToStructure — unit tests for the structure-side camera tween helper.
 *
 * `tweenToStructure` dispatches `startCameraTween` to the camera Redux slice
 * and wakes the render scheduler. It reads `from` from
 * `state.cameraRuntime.lastPose.current` (the live produced pose) and
 * `fovYRad` from `state.cameraRuntime.projection.fovYRad` (the engine
 * Resource), not from `state.cam`.
 *
 * Tests pin:
 *   - `startCameraTween` is dispatched with to.target = structure.worldPos
 *     and to.distance = structureFocusDistance(radius, fovYRad).
 *   - `from` sources from `cameraRuntime.lastPose.current`.
 *   - Apparent radius is preferred over physical core when present.
 *   - `scheduler.requestRender()` is called to wake the loop.
 *   - No-op when `state.cam` is null.
 *
 * `structureFocusDistance` arithmetic is covered by its own suite; these
 * tests only pin the plumbing between `tweenToStructure` and the store.
 */

import { describe, it, expect, vi } from 'vitest';

import { tweenToStructure } from '../../../../src/services/engine/camera/tweenToStructure';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { AppStore } from '../../../../src/store/types';
import type { AppDispatch } from '../../../../src/store/types';

const FOV_Y = (Math.PI / 180) * 60;

function makeState(opts: {
  cam?: object | null;
  lastPose?: CameraPose;
  fovYRad?: number;
  requestRender?: ReturnType<typeof vi.fn>;
}): EngineState {
  const lastPose: CameraPose = opts.lastPose ?? {
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: 100,
  };
  return {
    cam: opts.cam === undefined ? ({} as unknown) : opts.cam,
    cameraRuntime: {
      lastPose: { current: lastPose },
      projection: { fovYRad: opts.fovYRad ?? FOV_Y, aspect: 1, near: 0.01, far: 50000 },
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

const VIRGO: StructureInfo = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 20, 30],
  featured: true,
  physicalRadiusMpc: 2,
};

describe('tweenToStructure', () => {
  it('dispatches startCameraTween with to.target = worldPos', () => {
    const state = makeState({});
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0]![0] as unknown as { type: string };
    expect(action.type).toBe('camera/startCameraTween');
    const payload = (action as unknown as { payload: { to: CameraPose } }).payload;
    expect(payload.to.target).toEqual([10, 20, 30]);
  });

  it('frames via structureFocusDistance(physicalRadius, projection.fovYRad) when no apparentRadius', () => {
    const state = makeState({ fovYRad: FOV_Y });
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    const payload = (
      dispatch.mock.calls[0]![0] as unknown as { payload: { to: CameraPose } }
    ).payload;
    expect(payload.to.distance).toBe(structureFocusDistance(2, FOV_Y));
  });

  it('frames via apparentRadius when the structure carries one', () => {
    // Apparent extent (6 Mpc) > physical core (2 Mpc); the framing uses the
    // wider apparent extent so the close-approach fade ring lands just in view.
    const withApparent: StructureInfo = { ...VIRGO, apparentRadiusMpc: 6 };
    const state = makeState({ fovYRad: FOV_Y });
    const { store, dispatch } = makeStore();

    tweenToStructure(state, withApparent, store);

    const payload = (
      dispatch.mock.calls[0]![0] as unknown as { payload: { to: CameraPose } }
    ).payload;
    expect(payload.to.distance).toBe(structureFocusDistance(6, FOV_Y));
  });

  it('reads `from` from cameraRuntime.lastPose.current, not state.cam', () => {
    const lastPose: CameraPose = { target: [1, 2, 3], yaw: 0.7, pitch: -0.3, distance: 55 };
    const state = makeState({ lastPose });
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    const payload = (dispatch.mock.calls[0]![0] as unknown as { payload: { from: CameraPose } }).payload;
    expect(payload.from).toEqual(lastPose);
  });

  it('preserves from.yaw and from.pitch as to.yaw and to.pitch', () => {
    const lastPose: CameraPose = { target: [0, 0, 0], yaw: 1.2, pitch: -0.4, distance: 50 };
    const state = makeState({ lastPose });
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    const payload = (dispatch.mock.calls[0]![0] as unknown as { payload: { to: CameraPose } }).payload;
    expect(payload.to.yaw).toBe(1.2);
    expect(payload.to.pitch).toBe(-0.4);
  });

  it('dispatches with durationMs = FOCUS_TWEEN_MS and easing = easeOutCubic', () => {
    const state = makeState({});
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    const payload = (
      dispatch.mock.calls[0]![0] as unknown as { payload: { durationMs: number; easing: string } }
    ).payload;
    expect(payload.durationMs).toBe(FOCUS_TWEEN_MS);
    expect(payload.easing).toBe('easeOutCubic');
  });

  it('calls scheduler.requestRender() to wake the render loop', () => {
    const requestRender = vi.fn<() => void>();
    const state = makeState({ requestRender });
    const { store } = makeStore();

    tweenToStructure(state, VIRGO, store);

    expect(requestRender).toHaveBeenCalledOnce();
  });

  it('is a no-op when state.cam is null', () => {
    const requestRender = vi.fn<() => void>();
    const state = makeState({ cam: null, requestRender });
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    expect(dispatch).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
