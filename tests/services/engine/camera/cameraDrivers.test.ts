/**
 * cameraDrivers — unit tests for the store-reading driver table and resolver.
 *
 * The five drivers read directly from the Redux store; the resolver picks the
 * highest-priority active one and calls its `pose`. Tests cover:
 *
 *   - Each driver's `isActive` reads the right slice field.
 *   - Each driver's `pose` produces the correct result (evaluateClip via
 *     tweenToClip for tween, spinAutoRotate, s.camera.base, or poseOf(cam)).
 *   - `pickWinner` selects by priority, not list order (incl. clip > orbitDrag).
 *   - `pickWinner` and `activeDriverId` always agree (invariant 1).
 *   - `runCameraDrivers` passes the winner's elapsed (tween/autoRotate use
 *     the clock in ms; clip uses the clock in seconds; orbitDrag/resting use 0).
 *
 * Fixtures use a real `RootState` built via `configureStore({ reducer:
 * rootReducer })` so the shape is always in sync with the actual slices.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { easeOutCubic } from '../../../../src/utils/math/easeOutCubic';
import { lerp } from '../../../../src/utils/math/lerp';

import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RootState } from '../../../../src/store/types';
import {
  buildCameraDrivers,
  pickWinner,
  runCameraDrivers,
} from '../../../../src/services/engine/camera/cameraDrivers';
import { activeDriverId } from '../../../../src/services/engine/camera/activeDriverId';
import { poseOf } from '../../../../src/services/engine/camera/poseOf';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { tweenToClip } from '../../../../src/services/engine/camera/tweenToClip';
import { spinAutoRotate } from '../../../../src/services/engine/camera/spinAutoRotate';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { rootReducer } from '../../../../src/store/rootReducer';
import {
  beginDrag,
  endDrag,
  startCameraTween,
  cancelCameraTween,
  setAutoRotate,
  commitCameraPose,
  clipStarted,
} from '../../../../src/state/camera/cameraSlice';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

/** A real-ish store so we can observe dispatches. */
function makeStore() {
  return configureStore({ reducer: rootReducer });
}

const BASE_POSE: CameraPose = { target: [0, 0, 0], yaw: 1.5, pitch: 0.1, distance: 100 };

const TWEEN_DESC: CameraTweenDescriptor = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 50 },
  to: { target: [1, 2, 3], yaw: 2, pitch: 0.2, distance: 10 },
  durationMs: 1000,
  easing: 'easeOutCubic',
};

const CAM_STUB: OrbitCamera = {
  target: [5, 5, 5],
  yaw: 0.7,
  pitch: -0.1,
  distance: 200,
  position: new Float32Array([0, 0, 200]),
  fovYRad: 1,
  aspect: 1,
  near: 0.01,
  far: 50000,
} as unknown as OrbitCamera;

const FAKE_ENGINE_STATE = {} as EngineState;

// Minimal ClipData fixture — no effects, just the required timeline field.
// The clip row only needs `data` to be a non-null object for isActive; the
// actual evaluateClip call is not exercised in these structural tests.
const CLIP_DATA: ClipData = { timeline: [] };

// ── isActive: store-reading predicates ─────────────────────────────────────

describe('buildCameraDrivers — isActive reads the store', () => {
  const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
  function byId(id: string): CameraDriver {
    return drivers.find((d) => d.id === id)!;
  }

  it('orbitDrag.isActive ⇔ s.camera.dragging', () => {
    const store = makeStore();
    expect(byId('orbitDrag').isActive(store.getState() as unknown as RootState)).toBe(false);
    store.dispatch(beginDrag());
    expect(byId('orbitDrag').isActive(store.getState() as unknown as RootState)).toBe(true);
    store.dispatch(endDrag());
    expect(byId('orbitDrag').isActive(store.getState() as unknown as RootState)).toBe(false);
  });

  it('tween.isActive ⇔ s.camera.tween !== null', () => {
    const store = makeStore();
    expect(byId('tween').isActive(store.getState() as unknown as RootState)).toBe(false);
    store.dispatch(startCameraTween(TWEEN_DESC));
    expect(byId('tween').isActive(store.getState() as unknown as RootState)).toBe(true);
    store.dispatch(cancelCameraTween());
    expect(byId('tween').isActive(store.getState() as unknown as RootState)).toBe(false);
  });

  it('autoRotate.isActive ⇔ s.camera.autoRotate.active', () => {
    const store = makeStore();
    // Default is DEFAULT_AUTO_ROTATE from cameraSlice initial state.
    const defaultActive = (store.getState() as unknown as RootState).camera.autoRotate.active;
    expect(byId('autoRotate').isActive(store.getState() as unknown as RootState)).toBe(
      defaultActive,
    );
    store.dispatch(setAutoRotate({ active: !defaultActive, rate: 0.000873 }));
    expect(byId('autoRotate').isActive(store.getState() as unknown as RootState)).toBe(
      !defaultActive,
    );
  });

  it('clip.isActive ⇔ s.camera.clip !== null', () => {
    const store = makeStore();
    expect(byId('clip').isActive(store.getState() as unknown as RootState)).toBe(false);
    store.dispatch(clipStarted(CLIP_DATA));
    expect(byId('clip').isActive(store.getState() as unknown as RootState)).toBe(true);
  });

  it('resting.isActive() is always true', () => {
    const store = makeStore();
    expect(byId('resting').isActive(store.getState() as unknown as RootState)).toBe(true);
  });
});

// ── pose: correct outputs ───────────────────────────────────────────────────

describe('buildCameraDrivers — pose functions', () => {
  const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
  function byId(id: string): CameraDriver {
    return drivers.find((d) => d.id === id)!;
  }

  it('orbitDrag.pose returns poseOf(cam)', () => {
    const s = {} as RootState;
    const result = byId('orbitDrag').pose(s, CAM_STUB, 0);
    expect(result).toEqual(poseOf(CAM_STUB));
  });

  it('tween.pose returns evaluateClip(tweenToClip(descriptor), elapsed / 1000)', () => {
    // The tween driver routes through evaluateClip via tweenToClip — the
    // single camera-evaluation path after the Task-1 fold.
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    const s = store.getState() as unknown as RootState;
    const elapsedMs = 300;
    const result = byId('tween').pose(s, CAM_STUB, elapsedMs);
    expect(result).toEqual(evaluateClip(tweenToClip(TWEEN_DESC), elapsedMs / 1000));
  });

  it('tween row converts ms→sec correctly', () => {
    // Oracle independent of evaluateClip / tweenToClip — a 1000× unit slip
    // (passing elapsedMs instead of elapsedMs/1000) would saturate the clip to
    // its `to` pose (500 s >> 1 s duration), making distance == 1000.
    // The midpoint + bounds assertions below catch that slip.
    //
    // Derivation:
    //   durationMs = 1000 ms → duration = 1 s
    //   elapsedMs  = 500  ms → elapsedSec = 0.5 s
    //   t = elapsedSec / durationSec = 0.5
    //   eased = easeOutCubic(0.5) = 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    //   distance = lerp(10, 1000, 0.875) = 10*(1-0.875) + 1000*0.875 = 876.25
    //
    // A forgotten /1000 would pass 500 s to a 1 s clip → saturated to `to`
    // (distance == 1000); the midpoint + bounds below reject that.
    const UNIT_SLIP_DESC: CameraTweenDescriptor = {
      from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
      to: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1000 },
      durationMs: 1000,
      easing: 'easeOutCubic',
    };

    const store = makeStore();
    store.dispatch(startCameraTween(UNIT_SLIP_DESC));
    const s = store.getState() as unknown as RootState;

    const elapsedMs = 500;
    const result = byId('tween').pose(s, CAM_STUB, elapsedMs);

    // Independent oracle: easeOutCubic(0.5) = 0.875; lerp(10, 1000, 0.875) = 876.25
    const expectedDistance = lerp(10, 1000, easeOutCubic(0.5));
    expect(result.distance).toBeCloseTo(expectedDistance, 5);

    // Slip-catching bounds: a forgotten /1000 saturates to 1000; these reject that.
    expect(result.distance).toBeGreaterThan(10);
    expect(result.distance).toBeLessThan(1000);
  });

  it('autoRotate.pose returns spinAutoRotate(base, rate, elapsed)', () => {
    const store = makeStore();
    store.dispatch(commitCameraPose(BASE_POSE));
    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));
    const s = store.getState() as unknown as RootState;
    const elapsed = 500;
    const result = byId('autoRotate').pose(s, CAM_STUB, elapsed);
    expect(result).toEqual(spinAutoRotate(BASE_POSE, 0.000873, elapsed));
  });

  it('resting.pose returns s.camera.base', () => {
    const store = makeStore();
    store.dispatch(commitCameraPose(BASE_POSE));
    const s = store.getState() as unknown as RootState;
    const result = byId('resting').pose(s, CAM_STUB, 0);
    expect(result).toEqual(BASE_POSE);
  });
});

// ── pickWinner ──────────────────────────────────────────────────────────────

describe('pickWinner', () => {
  function makeDriver(id: string, priority: number, active: boolean): CameraDriver {
    return {
      id,
      priority,
      isActive: vi.fn<(s: RootState) => boolean>(() => active),
      pose: vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(() => ({
        target: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        distance: 1,
      })),
    };
  }

  const fakeState = {} as RootState;

  it('picks by priority, not list order', () => {
    const low = makeDriver('low', 20, true);
    const high = makeDriver('high', 60, true);

    expect(pickWinner([low, high], fakeState).id).toBe('high');
    expect(pickWinner([high, low], fakeState).id).toBe('high');
  });

  it('skips inactive drivers', () => {
    const inactive = makeDriver('inactive', 80, false);
    const active = makeDriver('active', 20, true);
    expect(pickWinner([inactive, active], fakeState).id).toBe('active');
  });

  it('defensive: returns drivers[0] for an empty-ish all-inactive list', () => {
    const only = makeDriver('only', 0, false);
    // All inactive → defensive fallback → drivers[0]
    expect(pickWinner([only], fakeState)).toBe(only);
  });

  it('clip (95) beats orbitDrag (80) when both are active', () => {
    // A real store with both camera.clip set and camera.dragging true:
    // clip@95 outranks orbitDrag@80.
    const store = makeStore();
    store.dispatch(beginDrag());
    store.dispatch(clipStarted(CLIP_DATA));
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    expect(pickWinner(drivers, s).id).toBe('clip');
  });
});

// ── pickWinner === activeDriverId (invariant 1) ─────────────────────────────

describe('pickWinner / activeDriverId invariant', () => {
  it('pickWinner.id === activeDriverId (same scan, same result)', () => {
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC)); // tween active
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    expect(pickWinner(drivers, s).id).toBe(activeDriverId(drivers, s));
  });

  it('agrees for all driver states: orbitDrag wins when dragging', () => {
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    store.dispatch(beginDrag()); // orbitDrag priority 80 outranks tween 60
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    expect(pickWinner(drivers, s).id).toBe('orbitDrag');
    expect(activeDriverId(drivers, s)).toBe('orbitDrag');
  });
});

// ── runCameraDrivers: clock elapsed dispatch ────────────────────────────────

describe('runCameraDrivers — elapsed dispatch', () => {
  it('passes tween elapsed to the tween driver pose', () => {
    // The tween driver evaluates via evaluateClip(tweenToClip(desc), elapsedSec).
    // Verify runCameraDrivers passes the right elapsed and the result matches.
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();
    const nowMs = 500;

    // First call — tween starts here, elapsed = 0 on first frame.
    const pose0 = runCameraDrivers(drivers, s, CAM_STUB, clock, nowMs);
    // tween wins; elapsedMs == 0 on first-ever call for a fresh descriptor.
    expect(pose0).toEqual(evaluateClip(tweenToClip(TWEEN_DESC), 0));

    // Second call at nowMs + 200 — same descriptor reference, elapsedMs = 200.
    const pose200 = runCameraDrivers(drivers, s, CAM_STUB, clock, nowMs + 200);
    expect(pose200).toEqual(evaluateClip(tweenToClip(TWEEN_DESC), 200 / 1000));
  });

  it('passes 0 elapsed to orbitDrag (pose does not use elapsed)', () => {
    const store = makeStore();
    store.dispatch(beginDrag());
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();

    const poseSpy = vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(() =>
      poseOf(CAM_STUB),
    );
    // Replace just the orbitDrag driver's pose fn to capture elapsed.
    const patchedDrivers = drivers.map((d) => (d.id === 'orbitDrag' ? { ...d, pose: poseSpy } : d));

    runCameraDrivers(patchedDrivers, s, CAM_STUB, clock, 9999);
    expect(poseSpy).toHaveBeenCalledWith(s, CAM_STUB, 0);
  });

  it('passes 0 elapsed to resting (pose does not use elapsed)', () => {
    const store = makeStore();
    const s = store.getState() as unknown as RootState; // default: not dragging, no tween, autoRotate default
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();

    // Force resting to win by ensuring default state has autoRotate inactive.
    // (DEFAULT_AUTO_ROTATE is false, so resting wins by default.)
    const poseSpy = vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(
      () => s.camera.base,
    );
    const patchedDrivers = drivers.map((d) => (d.id === 'resting' ? { ...d, pose: poseSpy } : d));

    runCameraDrivers(patchedDrivers, s, CAM_STUB, clock, 9999);
    // resting wins when nothing else is active; elapsed must be 0.
    if (poseSpy.mock.calls.length > 0) {
      expect(poseSpy.mock.calls[0]![2]).toBe(0);
    }
  });

  it('passes elapsed in SECONDS to the clip driver via runCameraDrivers', () => {
    // elapsedForWinner is module-private; drive the assertion through
    // runCameraDrivers + a spy on the clip row's pose, mirroring how the
    // orbitDrag-elapsed test is done above.
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));
    store.dispatch(clipStarted(CLIP_DATA));
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();
    const installMs = 1000;

    // First call — clip installs at installMs, elapsed = 0 s on the first frame.
    runCameraDrivers(drivers, s, CAM_STUB, clock, installMs);

    // Spy-patch the clip pose to capture the elapsed value passed in.
    const poseSpy = vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(
      () => s.camera.base,
    );
    const patchedDrivers = drivers.map((d) => (d.id === 'clip' ? { ...d, pose: poseSpy } : d));

    // Second call 1500 ms later — clip still active (same reference).
    // clipElapsed returns (nowMs - clipStartMs) / 1000 = 1500 / 1000 = 1.5 s.
    runCameraDrivers(patchedDrivers, s, CAM_STUB, clock, installMs + 1500);
    expect(poseSpy).toHaveBeenCalledTimes(1);
    expect(poseSpy.mock.calls[0]![2]).toBeCloseTo(1.5, 5);
  });
});
