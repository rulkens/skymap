/**
 * tweenToGalaxy — unit tests for the camera-tween-to-galaxy helper.
 *
 * Three public-handle methods (`focusOn`, `selectFamous`, `selectByAlias`)
 * each open-coded the same five-line "build a CameraTween from a galaxy's
 * world-space position + diameter, hand it to the tween manager" block.
 * `tweenToGalaxy` reifies that block as a single helper.  These tests
 * exercise it without spinning up the full engine:
 *
 *   - happy path: the tween descriptor lands in `tweens.start` with
 *     to-target = (info.x, info.y, info.z), to-distance derived from
 *     diameterKpc, and from-* snapshots cloned off the live camera so
 *     interrupting an in-flight tween hands off smoothly;
 *   - dispatch: `startCameraTween` is also dispatched with the matching
 *     descriptor so the camera slice stays in sync (dual-write bridge);
 *   - cam-null guard: when the engine has been destroyed (or is still
 *     bootstrapping pre-`startLoop`) `state.cam` is null — the helper
 *     must short-circuit silently rather than dereference null.
 *
 * We intentionally do NOT re-test `galaxyFocusDistance` here — its own
 * test suite covers the diameter-to-distance math.  This test only
 * verifies the *plumbing* between the helper and the tween manager.
 *
 * The scheduler wake is NOT asserted here — `tweens.start` owns it, and
 * wake coverage lives in tweenManager.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';

import { tweenToGalaxy } from '../../../../src/services/engine/camera/tweenToGalaxy';
import { galaxyFocusDistance } from '../../../../src/services/engine/camera/galaxyFocusDistance';
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AppStore } from '../../../../src/store/types';
import type { AppDispatch } from '../../../../src/store/types';

/**
 * Build a minimal `EngineState`-shaped fixture that exposes only the
 * fields `tweenToGalaxy` reads: `cam` and `subsystems.tweens.start`.
 * Casting through `unknown` keeps the test honest — if the helper ever
 * reaches for a field outside this pair, the test will surface it as a
 * runtime undefined rather than a silently-passing stub.
 */
function makeState(opts: {
  cam: { target: [number, number, number]; distance: number; yaw: number; pitch: number } | null;
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

describe('tweenToGalaxy', () => {
  it('starts a CameraTween toward (info.x, info.y, info.z) with galaxyFocusDistance(diameterKpc)', () => {
    const start = vi.fn();
    const cam = {
      target: [1, 2, 3] as [number, number, number],
      distance: 50,
      yaw: 0.25,
      pitch: -0.1,
    };
    const state = makeState({ cam, start });
    const { store } = makeStore();

    tweenToGalaxy(state, { x: 100, y: 200, z: 300, diameterKpc: 25 }, store);

    expect(start).toHaveBeenCalledOnce();
    const tween = start.mock.calls[0]![0];
    // toTarget is whatever vec3.fromValues produced — a 3-element array-like
    // whose contents must equal (100, 200, 300).
    expect(Array.from(tween.toTarget as ArrayLike<number>)).toEqual([100, 200, 300]);
    expect(tween.toDistance).toBe(galaxyFocusDistance(25));
    // from-* snapshots come straight off the live camera.
    expect(tween.fromDistance).toBe(50);
    expect(tween.fromYaw).toBe(0.25);
    expect(tween.fromPitch).toBe(-0.1);
    // Yaw / pitch are preserved — the tween only moves target + distance.
    expect(tween.toYaw).toBe(cam.yaw);
    expect(tween.toPitch).toBe(cam.pitch);
    // Duration is the project-wide focus tween length (sourced from
    // focusTweenDuration.ts so this assertion stays honest if the constant moves).
    expect(typeof tween.durationMs).toBe('number');
    expect(tween.durationMs).toBeGreaterThan(0);
    // startMs is `performance.now()`-shaped — finite, non-negative.
    expect(Number.isFinite(tween.startMs)).toBe(true);
    expect(tween.startMs).toBeGreaterThanOrEqual(0);
  });

  it('dispatches startCameraTween with matching from/to descriptor', () => {
    const start = vi.fn();
    const cam = {
      target: [1, 2, 3] as [number, number, number],
      distance: 50,
      yaw: 0.25,
      pitch: -0.1,
    };
    const state = makeState({ cam, start });
    const { store, dispatch } = makeStore();

    tweenToGalaxy(state, { x: 100, y: 200, z: 300, diameterKpc: 25 }, store);

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
    expect(payload.from.target).toEqual([1, 2, 3]);
    expect(payload.from.yaw).toBe(0.25);
    expect(payload.from.pitch).toBe(-0.1);
    expect(payload.from.distance).toBe(50);
    // to = framing target.
    expect(payload.to.target).toEqual([100, 200, 300]);
    expect(payload.to.yaw).toBe(cam.yaw);
    expect(payload.to.pitch).toBe(cam.pitch);
    expect(payload.to.distance).toBe(galaxyFocusDistance(25));
    expect(payload.durationMs).toBe(FOCUS_TWEEN_MS);
    expect(payload.easing).toBe('easeOutCubic');
  });

  it('clones cam.target so later mutation of cam.target does not corrupt the tween snapshot', () => {
    const start = vi.fn();
    const cam = {
      target: [1, 2, 3] as [number, number, number],
      distance: 10,
      yaw: 0,
      pitch: 0,
    };
    const state = makeState({ cam, start });
    const { store } = makeStore();

    tweenToGalaxy(state, { x: 0, y: 0, z: 0, diameterKpc: 30 }, store);

    const captured = start.mock.calls[0]![0].fromTarget as ArrayLike<number>;
    // Mutate the live camera target after the tween was started.
    cam.target[0] = 999;
    cam.target[1] = 999;
    cam.target[2] = 999;
    // The captured snapshot must be unchanged.
    expect(Array.from(captured)).toEqual([1, 2, 3]);
  });

  it('is a no-op when state.cam is null (post-destroy / pre-startLoop race window)', () => {
    const start = vi.fn();
    const state = makeState({ cam: null, start });
    const { store, dispatch } = makeStore();

    tweenToGalaxy(state, { x: 100, y: 200, z: 300, diameterKpc: 25 }, store);

    expect(start).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
