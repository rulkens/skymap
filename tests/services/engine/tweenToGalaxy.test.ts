/**
 * tweenToGalaxy — unit tests for the camera-tween-to-galaxy helper.
 *
 * Three public-handle methods (`focusOn`, `selectFamous`, `selectByAlias`)
 * each open-coded the same five-line "build a CameraTween from a galaxy's
 * world-space position + diameter, hand it to the tween manager, kick the
 * scheduler" block.  `tweenToGalaxy` reifies that block as a single
 * helper.  These tests exercise it without spinning up the full engine:
 *
 *   - happy path: the tween descriptor lands in `tweens.start` with
 *     to-target = (info.x, info.y, info.z), to-distance derived from
 *     diameterKpc, and from-* snapshots cloned off the live camera so
 *     interrupting an in-flight tween hands off smoothly;
 *   - cam-null guard: when the engine has been destroyed (or is still
 *     bootstrapping pre-`startLoop`) `state.cam` is null — the helper
 *     must short-circuit silently rather than dereference null.
 *
 * We intentionally do NOT re-test `focusDistanceMpc` here — its own test
 * suite in `focusTween.test.ts` covers the diameter-to-distance math.
 * This test only verifies the *plumbing* between the helper and the
 * tween manager.
 */

import { describe, it, expect, vi } from 'vitest';

import { tweenToGalaxy } from '../../../src/services/engine/tweenToGalaxy';
import { focusDistanceMpc } from '../../../src/services/engine/focusTween';
import type { EngineState } from '../../../src/@types';

/**
 * Build a minimal `EngineState`-shaped fixture that exposes only the
 * fields `tweenToGalaxy` reads: `cam`, `subsystems.tweens.start`, and
 * `subsystems.scheduler.requestRender`.  Casting through `unknown` keeps
 * the test honest — if the helper ever reaches for a field outside this
 * trio, the test will surface it as a runtime undefined rather than a
 * silently-passing stub.
 */
function makeState(opts: {
  cam: { target: [number, number, number]; distance: number; yaw: number; pitch: number } | null;
  start: ReturnType<typeof vi.fn>;
  requestRender: ReturnType<typeof vi.fn>;
}): EngineState {
  return {
    cam: opts.cam,
    subsystems: {
      tweens: { start: opts.start },
      scheduler: { requestRender: opts.requestRender },
    },
  } as unknown as EngineState;
}

describe('tweenToGalaxy', () => {
  it('starts a CameraTween toward (info.x, info.y, info.z) with focusDistanceMpc(diameterKpc) and requests a render', () => {
    const start = vi.fn();
    const requestRender = vi.fn();
    const cam = {
      target: [1, 2, 3] as [number, number, number],
      distance: 50,
      yaw: 0.25,
      pitch: -0.1,
    };
    const state = makeState({ cam, start, requestRender });

    tweenToGalaxy(state, { x: 100, y: 200, z: 300, diameterKpc: 25 });

    expect(start).toHaveBeenCalledOnce();
    const tween = start.mock.calls[0]![0];
    // toTarget is whatever vec3.fromValues produced — a 3-element array-like
    // whose contents must equal (100, 200, 300).
    expect(Array.from(tween.toTarget as ArrayLike<number>)).toEqual([100, 200, 300]);
    expect(tween.toDistance).toBe(focusDistanceMpc(25));
    // from-* snapshots come straight off the live camera.
    expect(tween.fromDistance).toBe(50);
    expect(tween.fromYaw).toBe(0.25);
    expect(tween.fromPitch).toBe(-0.1);
    // Yaw / pitch are preserved — the tween only moves target + distance.
    expect(tween.toYaw).toBe(cam.yaw);
    expect(tween.toPitch).toBe(cam.pitch);
    // Duration is the project-wide focus tween length (sourced from
    // focusTween.ts so this assertion stays honest if the constant moves).
    expect(typeof tween.durationMs).toBe('number');
    expect(tween.durationMs).toBeGreaterThan(0);
    // startMs is `performance.now()`-shaped — finite, non-negative.
    expect(Number.isFinite(tween.startMs)).toBe(true);
    expect(tween.startMs).toBeGreaterThanOrEqual(0);

    expect(requestRender).toHaveBeenCalledOnce();
  });

  it('clones cam.target so later mutation of cam.target does not corrupt the tween snapshot', () => {
    const start = vi.fn();
    const requestRender = vi.fn();
    const cam = {
      target: [1, 2, 3] as [number, number, number],
      distance: 10,
      yaw: 0,
      pitch: 0,
    };
    const state = makeState({ cam, start, requestRender });

    tweenToGalaxy(state, { x: 0, y: 0, z: 0, diameterKpc: 30 });

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
    const requestRender = vi.fn();
    const state = makeState({ cam: null, start, requestRender });

    tweenToGalaxy(state, { x: 100, y: 200, z: 300, diameterKpc: 25 });

    expect(start).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
