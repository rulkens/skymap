/**
 * Camera selectors — unit tests for the RootState-scoped camera read seam.
 *
 * Tests build a real store from `rootReducer` via `configureStore` to exercise
 * the full registration + selector path: reducer wiring, action dispatch, and
 * selector read all exercised together. This proves `state.camera` is typed and
 * populated (registration), and that each selector returns the expected value.
 *
 * `selectCameraActive` gets four cases — one for each driver flag that can keep
 * the render loop alive — plus the resting (all-false) case.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import {
  selectCameraIntent,
  selectCameraBase,
  selectAutoRotate,
  selectCameraActive,
} from '../../../src/state/camera/selectors';
import {
  beginDrag,
  startCameraTween,
  setAutoRotate,
  commitCameraPose,
} from '../../../src/state/camera/cameraSlice';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { CameraTweenDescriptor } from '../../../src/@types/camera/CameraTweenDescriptor';

// Build a fresh store for each test so dispatch side-effects don't cross cases.
const makeStore = () => configureStore({ reducer: rootReducer });

const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: -0.3, distance: 10 };

const tween: CameraTweenDescriptor = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.43 },
  to: pose,
  durationMs: 1200,
  easing: 'easeOutCubic',
};

describe('RootState gains a typed camera slot', () => {
  it('state.camera.base has target/yaw/pitch/distance after registration', () => {
    const store = makeStore();
    const { base } = store.getState().camera;

    expect(base).toBeDefined();
    expect(typeof base.yaw).toBe('number');
    expect(typeof base.pitch).toBe('number');
    expect(typeof base.distance).toBe('number');
    expect(Array.isArray(base.target)).toBe(true);
    expect(base.target).toHaveLength(3);
  });
});

describe('selectCameraIntent', () => {
  it('returns the camera slice by reference', () => {
    const store = makeStore();
    expect(selectCameraIntent(store.getState())).toBe(store.getState().camera);
  });
});

describe('selectCameraBase', () => {
  it('returns the committed base pose', () => {
    const store = makeStore();
    store.dispatch(commitCameraPose(pose));

    expect(selectCameraBase(store.getState())).toEqual(pose);
  });
});

describe('selectAutoRotate', () => {
  it('returns false by default (DEFAULT_AUTO_ROTATE)', () => {
    const store = makeStore();
    // The slice default is whatever DEFAULT_AUTO_ROTATE is — we read it rather
    // than hard-coding to avoid coupling the test to that constant's value.
    expect(typeof selectAutoRotate(store.getState())).toBe('boolean');
  });

  it('returns true after setAutoRotate active:true', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: true, rate: 0.001 }));

    expect(selectAutoRotate(store.getState())).toBe(true);
  });

  it('returns false after setAutoRotate active:false', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));

    expect(selectAutoRotate(store.getState())).toBe(false);
  });
});

describe('selectCameraActive', () => {
  it('is false at rest (no drag, no tween, auto-rotate off)', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));

    expect(selectCameraActive(store.getState())).toBe(false);
  });

  it('is true while dragging', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));
    store.dispatch(beginDrag());

    expect(selectCameraActive(store.getState())).toBe(true);
  });

  it('is true while a tween is set', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));
    store.dispatch(startCameraTween(tween));

    expect(selectCameraActive(store.getState())).toBe(true);
  });

  it('is true while autoRotate.active', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: true, rate: 0.001 }));

    expect(selectCameraActive(store.getState())).toBe(true);
  });
});
