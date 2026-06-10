/**
 * tweenManager — unit tests for the engine's at-most-one-tween manager.
 *
 * The manager is a thin facade over `advanceCameraTween` plus a single
 * mutable reference, so the tests focus on the state-machine-y bits
 * the engine relies on:
 *
 *   - `isActive()` flips true after `start` and false after `cancel`.
 *   - `start()` replaces (not queues) the running tween.
 *   - `advance()` returns `true` exactly once when the tween reaches
 *     its end, and the manager auto-clears the reference so a follow-
 *     up `isActive()` returns false (no manual cancel needed).
 *   - `advance()` returns `false` when no tween is in flight.
 *   - `cancel()` mid-flight makes subsequent `advance()` calls a no-op.
 *   - Wake contract: `start()` wakes the injected scheduler; `cancel()`
 *     and `advance()` never do.
 */

import { describe, it, expect, vi } from 'vitest';
import { vec3 } from 'gl-matrix';

import { createOrbitCamera } from '../../../../src/services/camera/orbitCamera';
import type { CameraTween } from '../../../../src/@types/camera/CameraTween';
import { createTweenManager } from '../../../../src/services/engine/camera/tweenManager';

// No-op wake stub for tests that don't care about scheduling.
function makeTweenManager() {
  return createTweenManager({ requestRender: () => {} });
}

function makeCam() {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 100,
    yaw: 0,
    pitch: 0,
    fovYRad: Math.PI / 4,
    aspect: 1,
    near: 1,
    far: 1000,
  });
}

function makeTween(startMs: number, durationMs: number): CameraTween {
  return {
    startMs,
    durationMs,
    fromTarget: vec3.fromValues(0, 0, 0),
    toTarget: vec3.fromValues(10, 0, 0),
    fromDistance: 100,
    toDistance: 50,
    fromYaw: 0,
    toYaw: 0,
    fromPitch: 0,
    toPitch: 0,
  };
}

describe('createTweenManager', () => {
  it('reports inactive on a fresh manager', () => {
    const tm = makeTweenManager();
    expect(tm.isActive()).toBe(false);
  });

  it('flips active after start and inactive after cancel', () => {
    const tm = makeTweenManager();
    tm.start(makeTween(1000, 600));
    expect(tm.isActive()).toBe(true);
    tm.cancel();
    expect(tm.isActive()).toBe(false);
  });

  it('start replaces (not queues) the running tween', () => {
    const tm = makeTweenManager();
    const cam = makeCam();
    // First tween targets x=10
    tm.start(makeTween(0, 600));
    // Replace with a tween that targets x=42
    const second: CameraTween = {
      ...makeTween(0, 600),
      toTarget: vec3.fromValues(42, 0, 0),
    };
    tm.start(second);
    // Snap to end (t >= 1) so the lerp lands on toTarget.
    tm.advance(cam, 9999);
    expect(cam.target[0]).toBeCloseTo(42, 6);
  });

  it('advance returns false and is a no-op when no tween is active', () => {
    const tm = makeTweenManager();
    const cam = makeCam();
    const finished = tm.advance(cam, 1000);
    expect(finished).toBe(false);
    expect(cam.target[0]).toBeCloseTo(0, 6);
    expect(cam.distance).toBeCloseTo(100, 6);
  });

  it('advance mutates the camera while in flight and returns false', () => {
    const tm = makeTweenManager();
    const cam = makeCam();
    tm.start(makeTween(1000, 600));
    const finished = tm.advance(cam, 1300); // halfway-ish
    expect(finished).toBe(false);
    expect(tm.isActive()).toBe(true);
    // Eased target should be partway between 0 and 10.
    expect(cam.target[0]).toBeGreaterThan(0);
    expect(cam.target[0]).toBeLessThan(10);
  });

  it('advance returns true once at completion and auto-clears the reference', () => {
    const tm = makeTweenManager();
    const cam = makeCam();
    tm.start(makeTween(1000, 600));
    const finished = tm.advance(cam, 1600);
    expect(finished).toBe(true);
    expect(tm.isActive()).toBe(false);
    expect(cam.target[0]).toBeCloseTo(10, 6);
  });

  it('cancel mid-flight stops further advances from mutating the camera', () => {
    const tm = makeTweenManager();
    const cam = makeCam();
    tm.start(makeTween(1000, 600));
    tm.advance(cam, 1100); // partway
    const xAfterFirst = cam.target[0];
    tm.cancel();
    // Even if we keep advancing well past the deadline, no mutation
    // should land — the manager dropped its reference.
    tm.advance(cam, 9999);
    expect(cam.target[0]).toBeCloseTo(xAfterFirst, 6);
    expect(tm.isActive()).toBe(false);
  });

  it('start wakes the scheduler', () => {
    const requestRender = vi.fn();
    const tm = createTweenManager({ requestRender });
    tm.start(makeTween(0, 600));
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('cancel and advance do not wake', () => {
    const requestRender = vi.fn();
    const tm = createTweenManager({ requestRender });
    tm.start(makeTween(0, 600));
    requestRender.mockClear();
    const cam = makeCam();
    // Advance the live tween (mid-flight, then completion) before cancelling —
    // the spy must stay silent through both, not just the no-tween early-return.
    tm.advance(cam, 300); // mid-flight
    tm.advance(cam, 600); // completion — manager auto-clears the reference
    tm.cancel(); // no-op on already-cleared reference
    expect(requestRender).not.toHaveBeenCalled();
  });
});
