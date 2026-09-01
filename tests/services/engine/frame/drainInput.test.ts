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
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';

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
    subsystems: { inputAggregator },
    cameraRuntime: {
      clock: createCameraClock(),
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance } },
      prevActiveId: { current: 'resting' },
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
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });
    agg.push({ kind: 'gestureEnd' });

    drainInput(state, deps, 0);

    expect(store.getState().camera.base.yaw).toBeCloseTo(-50 * 0.005, 6);
    expect(store.getState().camera.dragging).toBe(false);
  });

  it('routes an at-rest wheel to the store base, not the drag register', () => {
    // With no gesture the resting driver renders `base`, so a register mutation
    // would be invisible.
    const { cam, agg, state, deps, store } = makeHarness();
    const baseBefore = store.getState().camera.base.distance;
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false });

    drainInput(state, deps, 0);

    expect(cam.distance).toBe(100);
    // deltaY > 0 zooms out, so the committed base grew.
    expect(store.getState().camera.base.distance).toBeGreaterThan(baseBefore);
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
