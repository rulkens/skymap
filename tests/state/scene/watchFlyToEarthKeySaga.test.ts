/**
 * watchFlyToEarthKeySaga tests — integration over a real store + saga middleware,
 * with `createKeyboardListener` mocked so no real `hotkeys-js`/DOM is involved
 * (the `watchTourKeyboardSaga.test.ts` idiom: the mock returns a real redux-saga
 * `eventChannel` whose `emit` is exposed on a hoisted holder so a test can push
 * a synthetic keypress). The engine resources (`cameraRuntime`, `earthBody`)
 * are stubbed via `sagaMiddleware.setContext`, mirroring
 * `watchFocusTweenSaga.test.ts` — the two bail branches are exercised by
 * swapping the stubs to return null.
 *
 * ### Timing
 *
 * An `eventChannel` emit is delivered on a macrotask boundary, so one `flush()`
 * lets the saga's `take(channel)` pick it up and `put` the tween.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

// Hoisted holder the mock writes into — vi.mock factories are hoisted above the
// module body, so the shared handle must be created with vi.hoisted.
const h = vi.hoisted(() => ({
  emit: undefined as undefined | ((key: string) => void),
  keys: '',
}));

vi.mock('../../../src/services/input/createKeyboardListener', async () => {
  const { eventChannel } = await import('redux-saga');
  return {
    createKeyboardListener: (keys: string) => {
      h.keys = keys;
      return eventChannel<string>((emit) => {
        h.emit = emit;
        return () => undefined;
      });
    },
  };
});

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFlyToEarthKeySaga } from '../../../src/state/scene/watchFlyToEarthKeySaga';
import { earthSurfaceFraming } from '../../../src/utils/camera/earthSurfaceFraming';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { cameraRoute, timeRoute } from '../../../src/store/constants';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { EarthBody } from '../../../src/@types/scene/EarthBody';
import type { LiveCameraRuntime } from '../../../src/store/types';

const flush = () => new Promise((r) => setTimeout(r, 0));

// A live from-pose to seed the tween: the saga preserves yaw/pitch and swaps
// only target/distance, so the descriptor is fully determined by (pose, Earth).
const FROM: CameraPose = { target: [1, 1, 1], yaw: 0.5, pitch: -0.2, distance: 9 };

describe('watchFlyToEarthKeySaga', () => {
  let store: ReturnType<typeof build>;
  let cameraRuntime: () => LiveCameraRuntime | null;
  let earthBody: () => EarthBody | null;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchFlyToEarthKeySaga);
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, frameBasisQuat: [0, 0, 0, 1] });
    earthBody = () => SCENE_EARTH;
    mw.setContext({ cameraRuntime: () => cameraRuntime(), earthBody: () => earthBody() });
    return s;
  }
  beforeEach(() => {
    h.emit = undefined;
    h.keys = '';
    vi.clearAllMocks();
    store = build();
  });

  it('watchFlyToEarthKeySaga frames Earth from the LIVE sim instant on the key', async () => {
    await flush(); // let the saga bind the channel
    expect(h.keys).toBe('e');

    // Freeze the clock at a clearly non-J2000 instant so the derived Earth
    // position is deterministic (a paused clock ignores the wall clock) AND
    // proves the saga reads the live instant, not a hardcoded epoch. The same
    // `nowMs` on both actions gives zero elapsed, so the anchor lands exactly on
    // the chosen instant.
    const now = performance.now();
    store.dispatch(setSimDays({ simDays: CONST_J2000 + 300, nowMs: now }));
    store.dispatch(pause({ nowMs: now }));

    h.emit!('e');
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    // The saga derives Earth's position at the frozen instant (paused ⇒ any nowMs
    // yields the same value), then frames off it + the record radius.
    const simDays = deriveSimDays(store.getState()[timeRoute], performance.now());
    const earthPos = deriveBodyStates(simDays).get('earth')!.positionMpc;
    const framing = earthSurfaceFraming(earthPos, SCENE_EARTH.radiusKm);
    expect(tween!.to.target).toEqual(framing.target);
    expect(tween!.to.distance).toBe(framing.distance);
    expect(tween!.to.yaw).toBe(FROM.yaw);
    expect(tween!.to.pitch).toBe(FROM.pitch);
  });

  it('watchFlyToEarthKeySaga is a no-op when the camera runtime is null', async () => {
    await flush();
    cameraRuntime = () => null;

    h.emit!('e');
    await flush();

    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  it('watchFlyToEarthKeySaga is a no-op when Earth is absent', async () => {
    await flush();
    earthBody = () => null;

    h.emit!('e');
    await flush();

    expect(store.getState()[cameraRoute].tween).toBeNull();
  });
});
