/**
 * drainInput — the frame's single input-apply site.
 *
 * What matters here is the wiring the recognizer no longer does for itself:
 * nothing reaches the camera between frames, a gesture that ENDS mid-frame
 * still commits the moves that preceded it, the at-rest wheel goes to the
 * store rather than the invisible register, and the focused body's radius
 * reaches the zoom floor.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { drainInput } from '../../../../src/services/engine/frame/drainInput';
import { createInputAggregator } from '../../../../src/services/engine/subsystems/inputAggregator';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { rootReducer } from '../../../../src/store/rootReducer';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { startCameraTween, beginDrag } from '../../../../src/state/camera/cameraSlice';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

function makeHarness(distance = 100) {
  const cam = createOrbitCamera({
    target: [0, 0, 0],
    distance,
    yaw: 0,
    pitch: 0,
    fovYRad: (Math.PI / 180) * 60,
    aspect: 1,
    near: 0.1,
    far: 1000,
  });
  const inputAggregator = createInputAggregator();
  const state = {
    cam,
    // The gesture seed resolves the live pose's arm, so the harness carries the
    // orientation + epoch that resolution reads.
    settings: { orientation: 'ecliptic' },
    subsystems: { inputAggregator },
    cameraRuntime: {
      clock: createCameraClock(),
      lastPose: { current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance }) },
      prevActiveId: { current: 'resting' },
      lastRenderedSimDays: { current: CONST_J2000 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
    },
  } as unknown as EngineState;

  const store = configureStore({ reducer: rootReducer });
  const deps = {
    canvas: { clientHeight: 1000 } as HTMLCanvasElement,
    cb: { store },
  } as unknown as RunFrameDeps;

  return { cam, agg: inputAggregator, state, deps, store };
}

describe('drainInput', () => {
  it('applies nothing until the frame drains', () => {
    const { cam, agg, state, deps } = makeHarness();
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });

    expect(cam.yaw).toBe(0);

    drainInput(state, deps, 0);
    expect(cam.yaw).toBeCloseTo(-50 * 0.005, 6);
  });

  it('commits the tail of a gesture that ended mid-frame', () => {
    // The pointerup used to fire the commit synchronously, with every move
    // already applied. Deferred, the moves must still land BEFORE the commit or
    // the store bakes a pose one frame stale.
    const { agg, state, deps, store } = makeHarness();
    // The sink already flipped `dragging` at DOM time; the drain ends it.
    store.dispatch(beginDrag());
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });
    agg.push({ kind: 'gestureEnd' });

    drainInput(state, deps, 0);

    expect(worldArmOf(store.getState().camera.base).yaw).toBeCloseTo(-50 * 0.005, 6);
    expect(store.getState().camera.dragging).toBe(false);
  });

  it('leaves a tween started after the pointerdown alone', () => {
    // `cancelCameraTween` fires at DOM time (the emit sink), NOT here. A
    // double-tap runs pointerdown → pointerup → click → dblclick → focus →
    // `watchFocusTweenSaga` → `startCameraTween`, all before the next frame:
    // cancelling at the drain would kill the tween the same tap just asked for
    // and double-click-to-focus would select but never fly.
    const { agg, state, deps, store } = makeHarness();
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'gestureEnd' });
    const pose = { target: [0, 0, 0] as Vec3, yaw: 1, pitch: 0, distance: 5 };
    store.dispatch(
      startCameraTween({
        from: pose,
        to: pose,
        durationMs: 800,
        easing: 'easeInOutCubic',
        frame: 'ecliptic',
      }),
    );

    drainInput(state, deps, 0);

    expect(store.getState().camera.tween).not.toBeNull();
  });

  it('routes an at-rest wheel to the store base, not the drag register', () => {
    // With no gesture the resting driver renders `base`, so a register mutation
    // would be invisible.
    const { cam, agg, state, deps, store } = makeHarness();
    const baseBefore = worldArmOf(store.getState().camera.base).distance;
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false });

    drainInput(state, deps, 0);

    expect(cam.distance).toBe(100);
    // deltaY > 0 zooms out, so the committed base grew.
    expect(worldArmOf(store.getState().camera.base).distance).toBeGreaterThan(baseBefore);
  });

  it('floors an in-gesture zoom at the focused body’s surface', () => {
    const { cam, agg, state, deps, store } = makeHarness(EARTH_RADIUS_MPC * 4);
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'earth',
          label: 'Earth',
          positionMpc: [0, 0, 0],
          radiusM: 6371000,
        },
      }),
    );

    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'pinchAnchor', distPx: 10 });
    agg.push({ kind: 'pinchMove', distPx: 10_000_000 });
    drainInput(state, deps, 0);

    const radii = cam.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });
});
