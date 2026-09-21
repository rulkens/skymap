/**
 * watchUrlPoseSaga tests — integration over a real store + saga middleware. No
 * engine context is stubbed: the saga reads only `engine.status` off the store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchUrlPoseSaga } from '../../../src/state/camera/watchUrlPoseSaga';
import { applyUrlPose } from '../../../src/state/camera/applyUrlPose';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { cameraRoute } from '../../../src/store/constants';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';

const flush = () => new Promise((r) => setTimeout(r, 0));

const FRAMED: FramedCameraPose = absoluteArm({
  target: [1, 2, 3],
  yaw: 0.7,
  pitch: -0.2,
  distance: 5.5,
});

describe('watchUrlPoseSaga', () => {
  let store: ReturnType<typeof build>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchUrlPoseSaga);
    return s;
  }
  beforeEach(() => {
    store = build();
  });

  it('commits immediately when the engine is already ready', async () => {
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 0 }));

    store.dispatch(applyUrlPose(FRAMED));
    await flush();

    expect(store.getState()[cameraRoute].base).toEqual(FRAMED);
  });

  it('waits for ready, then commits', async () => {
    // Default boot status is 'initializing' — not ready yet.
    store.dispatch(applyUrlPose(FRAMED));
    await flush();

    expect(store.getState()[cameraRoute].base).not.toEqual(FRAMED);

    store.dispatch(engineStatusChanged({ kind: 'ready', count: 0 }));
    await flush();

    expect(store.getState()[cameraRoute].base).toEqual(FRAMED);
  });
});
