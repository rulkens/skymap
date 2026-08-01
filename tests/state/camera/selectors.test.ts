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
  selectCameraBase,
  selectAutoRotate,
  selectCameraActive,
  selectClipActive,
} from '../../../src/state/camera/selectors';
import {
  beginDrag,
  startCameraTween,
  setAutoRotate,
  commitCameraPose,
  clipStarted,
  clipEnded,
  startFrameTween,
} from '../../../src/state/camera/cameraSlice';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { CameraTweenDescriptor } from '../../../src/@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { FrameTween } from '../../../src/@types/camera/FrameTween';

// Build a fresh store for each test so dispatch side-effects don't cross cases.
const makeStore = () => configureStore({ reducer: rootReducer });

const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: -0.3, distance: 10 };

const clipData: ClipData = { timeline: [] };
const clip = { data: clipData, frame: DEFAULT_ORIENTATION } as const;

const tween: CameraTweenDescriptor = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0.43 },
  to: pose,
  durationMs: 1200,
  easing: 'easeOutCubic',
  frame: DEFAULT_ORIENTATION,
};

const frameTween: FrameTween = {
  fromQuat: [0, 0, 0, 1],
  to: 'galactic',
  durationMs: 800,
  easing: 'easeInOutCubic',
};

describe('selectCameraBase', () => {
  it('returns the committed base pose', () => {
    const store = makeStore();
    store.dispatch(commitCameraPose(pose));

    expect(selectCameraBase(store.getState())).toEqual(pose);
  });
});

describe('selectAutoRotate', () => {
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

  it('is true while a clip is active', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));
    store.dispatch(clipStarted(clip));

    expect(selectCameraActive(store.getState())).toBe(true);
  });

  it('is true while a frameTween is in flight', () => {
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));
    store.dispatch(startFrameTween(frameTween));

    expect(selectCameraActive(store.getState())).toBe(true);
  });
});

describe('selectClipActive', () => {
  it('is false when no clip is set', () => {
    const store = makeStore();
    expect(selectClipActive(store.getState())).toBe(false);
  });

  it('is true after clipStarted and false after clipEnded', () => {
    const store = makeStore();
    store.dispatch(clipStarted(clip));
    expect(selectClipActive(store.getState())).toBe(true);
    store.dispatch(clipEnded());
    expect(selectClipActive(store.getState())).toBe(false);
  });
});
