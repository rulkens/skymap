import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../src/store/rootReducer';
import { createGestureSink } from '../../../../src/services/engine/interaction/createGestureSink';
import { createInputAggregator } from '../../../../src/services/engine/subsystems/inputAggregator';
import { startCameraTween } from '../../../../src/state/camera/cameraSlice';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

function makeSink() {
  const store = configureStore({ reducer: rootReducer });
  // Real, not a stub: draining it proves the events actually reach the queue.
  const aggregator = createInputAggregator();
  const requestRender = vi.fn();
  const sink = createGestureSink({ dispatch: store.dispatch, aggregator, requestRender });
  return { store, aggregator, requestRender, sink };
}

describe('createGestureSink', () => {
  it('queues an event and wakes the loop', () => {
    // The sink is the ONLY path from a DOM event to the camera: drop the push or
    // the wake and all input dies, while the halves either side of it
    // (`orbitControls`, `inputAggregator`, `replayInput`) each test a fake.
    const { aggregator, requestRender, sink } = makeSink();

    sink({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 500, yPx: 500 });

    expect(aggregator.drain()).toHaveLength(1);
    expect(requestRender).toHaveBeenCalled();
  });

  it('cancels an in-flight tween on the gesture-start emission, at DOM time', () => {
    // B1: `cancelCameraTween` must not wait for the frame's drain. A double-tap
    // runs pointerdown → … → dblclick → `watchFocusTweenSaga` → `startCameraTween`
    // inside one inter-frame gap, so a deferred cancel would kill the tween the
    // tap just requested and the camera would never fly.
    const { store, sink } = makeSink();

    const pose = { target: [0, 0, 0] as Vec3, yaw: 1, pitch: 0, distance: 5 };
    store.dispatch(
      startCameraTween({
        from: pose,
        to: pose,
        durationMs: 800,
        easing: 'linear',
        frame: 'ecliptic',
      }),
    );

    sink({ kind: 'gestureStart' });

    const root = store.getState();
    expect(root.camera.tween).toBeNull();
    expect(root.camera.dragging).toBe(true);
  });
});
