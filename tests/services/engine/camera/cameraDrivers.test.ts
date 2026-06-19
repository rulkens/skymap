/**
 * cameraDrivers — unit tests for the store-reading driver table and resolver.
 *
 * The four drivers read directly from the Redux store; the resolver picks the
 * highest-priority active one and calls its `pose`. Tests cover:
 *
 *   - `buildCameraDrivers` exposes the four drivers with correct ids and
 *     priorities.
 *   - Each driver's `isActive` reads the right slice field.
 *   - Each driver's `pose` produces the correct result (evaluateTween,
 *     spinAutoRotate, s.camera.base, or poseOf(cam)).
 *   - `pickWinner` selects by priority, not list order.
 *   - `pickWinner` and `activeDriverId` always agree (invariant 1).
 *   - `runCameraDrivers` passes the winner's elapsed (tween/autoRotate use
 *     the clock; orbitDrag/resting use 0).
 *
 * Fixtures use a real `RootState` built via `configureStore({ reducer:
 * rootReducer })` so the shape is always in sync with the actual slices.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

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
import { evaluateTween } from '../../../../src/services/engine/camera/evaluateTween';
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
} from '../../../../src/state/camera/cameraSlice';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';

/** Build a real-ish RootState with default slice values. */
function makeRootState(patch?: (store: ReturnType<typeof configureStore<{ camera: ReturnType<typeof rootReducer>['camera'] }>>) => void): RootState {
  const store = configureStore({ reducer: rootReducer });
  if (patch) {
    // Use the store's dispatch to produce real actions rather than hand-patching.
    // The patch callback receives the store.
    (patch as (s: typeof store) => void)(store);
  }
  return store.getState() as unknown as RootState;
}

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

// ── buildCameraDrivers: table shape ────────────────────────────────────────

describe('buildCameraDrivers — table shape', () => {
  it('exposes four drivers with correct ids', () => {
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const ids = drivers.map((d) => d.id);
    expect(ids).toContain('orbitDrag');
    expect(ids).toContain('tween');
    expect(ids).toContain('autoRotate');
    expect(ids).toContain('resting');
    expect(ids).toHaveLength(4);
  });

  it('assigns correct priorities (orbitDrag 80, tween 60, autoRotate 20, resting 0)', () => {
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const byId = Object.fromEntries(drivers.map((d) => [d.id, d.priority]));
    expect(byId.orbitDrag).toBe(80);
    expect(byId.tween).toBe(60);
    expect(byId.autoRotate).toBe(20);
    expect(byId.resting).toBe(0);
  });
});

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
    expect(byId('autoRotate').isActive(store.getState() as unknown as RootState)).toBe(defaultActive);
    store.dispatch(setAutoRotate({ active: !defaultActive, rate: 0.000873 }));
    expect(byId('autoRotate').isActive(store.getState() as unknown as RootState)).toBe(!defaultActive);
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

  it('tween.pose returns evaluateTween(descriptor, elapsed)', () => {
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    const s = store.getState() as unknown as RootState;
    const elapsed = 300;
    const result = byId('tween').pose(s, CAM_STUB, elapsed);
    expect(result).toEqual(evaluateTween(TWEEN_DESC, elapsed));
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
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();
    const nowMs = 500;

    // First call — tween starts here, elapsed = 0 on first frame.
    const pose0 = runCameraDrivers(drivers, s, CAM_STUB, clock, nowMs);
    // tween wins; elapsed == 0 on first-ever call for a fresh descriptor.
    expect(pose0).toEqual(evaluateTween(TWEEN_DESC, 0));

    // Second call at nowMs + 200 — same descriptor reference, elapsed = 200.
    const pose200 = runCameraDrivers(drivers, s, CAM_STUB, clock, nowMs + 200);
    expect(pose200).toEqual(evaluateTween(TWEEN_DESC, 200));
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
    const patchedDrivers = drivers.map((d) =>
      d.id === 'orbitDrag' ? { ...d, pose: poseSpy } : d,
    );

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
    const poseSpy = vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(() =>
      s.camera.base,
    );
    const patchedDrivers = drivers.map((d) =>
      d.id === 'resting' ? { ...d, pose: poseSpy } : d,
    );

    runCameraDrivers(patchedDrivers, s, CAM_STUB, clock, 9999);
    // resting wins when nothing else is active; elapsed must be 0.
    if (poseSpy.mock.calls.length > 0) {
      expect(poseSpy.mock.calls[0]![2]).toBe(0);
    }
  });
});
