/**
 * tweenToStructure — unit tests for the structure-side camera tween helper.
 *
 * Mirrors tweenToGalaxy.test.ts and shares the same plumbing contract (build
 * a CameraTween from a target, hand it to the tween manager). Differs only in
 * where toDistance comes from (`structureFocusDistance(apparentRadiusMpc,
 * fovYRad)` instead of the galaxy version). We assert the plumbing here —
 * including the apparent-radius fallback to the physical core — and leave
 * framing-math coverage to `structureFocusDistance.test.ts`.
 *
 * The dispatch assertion verifies the dual-write bridge: `startCameraTween`
 * is dispatched with the same descriptor shape as the `tweens.start` call.
 *
 * The scheduler wake is NOT asserted here — `tweens.start` owns it, and
 * wake coverage lives in tweenManager.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

import { tweenToStructure } from '../../../../src/services/engine/camera/tweenToStructure';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { AppStore } from '../../../../src/store/types';
import type { AppDispatch } from '../../../../src/store/types';

function makeState(opts: {
  cam: {
    target: [number, number, number];
    distance: number;
    yaw: number;
    pitch: number;
    fovYRad: number;
  } | null;
  start: ReturnType<typeof vi.fn>;
}): EngineState {
  return {
    cam: opts.cam,
    subsystems: {
      tweens: { start: opts.start },
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
  it('starts a CameraTween framed via structureFocusDistance', () => {
    const start = vi.fn();
    const cam = {
      target: [0, 0, 0] as [number, number, number],
      distance: 100,
      yaw: 0,
      pitch: 0,
      fovYRad: (Math.PI / 180) * 60,
    };
    const state = makeState({ cam, start });
    const { store } = makeStore();

    tweenToStructure(state, VIRGO, store);

    expect(start).toHaveBeenCalledOnce();
    const tween = start.mock.calls[0]![0];
    expect(Array.from(tween.toTarget as ArrayLike<number>)).toEqual([10, 20, 30]);
    // VIRGO has no apparentRadiusMpc → the helper frames the physical core
    // (2 Mpc), passing the camera's live fovY.
    expect(tween.toDistance).toBe(structureFocusDistance(2, cam.fovYRad));
  });

  it('dispatches startCameraTween with matching from/to descriptor', () => {
    const start = vi.fn();
    const cam = {
      target: [0, 0, 0] as [number, number, number],
      distance: 100,
      yaw: 0.5,
      pitch: -0.2,
      fovYRad: (Math.PI / 180) * 60,
    };
    const state = makeState({ cam, start });
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0]![0] as { type: string; payload: unknown };
    expect(action.type).toBe('camera/startCameraTween');
    const payload = action.payload as {
      from: { target: number[]; yaw: number; pitch: number; distance: number };
      to: { target: number[]; yaw: number; pitch: number; distance: number };
      durationMs: number;
      easing: string;
    };
    // from = pose snapshotted off the live camera at call time.
    expect(payload.from.target).toEqual([0, 0, 0]);
    expect(payload.from.yaw).toBe(0.5);
    expect(payload.from.pitch).toBe(-0.2);
    expect(payload.from.distance).toBe(100);
    // to = framing the physical core (VIRGO has no apparentRadiusMpc).
    expect(payload.to.target).toEqual([10, 20, 30]);
    expect(payload.to.yaw).toBe(cam.yaw);
    expect(payload.to.pitch).toBe(cam.pitch);
    expect(payload.to.distance).toBe(structureFocusDistance(2, cam.fovYRad));
    expect(payload.durationMs).toBe(FOCUS_TWEEN_MS);
    expect(payload.easing).toBe('easeOutCubic');
  });

  it('frames the wider apparent radius when the structure carries one', () => {
    const start = vi.fn();
    const cam = {
      target: [0, 0, 0] as [number, number, number],
      distance: 100,
      yaw: 0,
      pitch: 0,
      fovYRad: (Math.PI / 180) * 60,
    };
    const state = makeState({ cam, start });
    const { store } = makeStore();

    // Apparent extent (6 Mpc) is wider than the physical core (2 Mpc); the
    // fade reads the apparent radius, so the framing must too.
    const withApparent: StructureInfo = { ...VIRGO, apparentRadiusMpc: 6 };
    tweenToStructure(state, withApparent, store);

    const tween = start.mock.calls[0]![0];
    expect(tween.toDistance).toBe(structureFocusDistance(6, cam.fovYRad));
  });

  it('is a no-op when cam is null', () => {
    const start = vi.fn();
    const state = makeState({ cam: null, start });
    const { store, dispatch } = makeStore();

    tweenToStructure(state, VIRGO, store);

    expect(start).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
