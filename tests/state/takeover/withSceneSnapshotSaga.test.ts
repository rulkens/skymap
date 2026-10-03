/**
 * withSceneSnapshotSaga tests — the scene bracket tours and exhibits run their
 * bodies in: the lens is pinned for the run and every settings change the
 * body makes is wound back on exit.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';
import { put, take } from 'typed-redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { withSceneSnapshotSaga } from '../../../src/state/takeover/withSceneSnapshotSaga';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { setCosmicWebDensityEnabled } from '../../../src/layers/cosmicWebDensity/state/cosmicWebDensity/slice';
import { setFovDeg } from '../../../src/state/settings/core/cameraSettingsSlice';
import { DEFAULT_FOV_DEG } from '../../../src/data/defaults';

const flush = () => new Promise((r) => setTimeout(r, 0));

function buildStore() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  return { store, sagaMiddleware };
}

function* waitingBody(): Generator {
  yield* take(exitTakeover);
}

describe('withSceneSnapshotSaga', () => {
  // The poses every takeover flies to are authored at the default lens, and a
  // fit-derived distance clamps silently at MAX_DISTANCE_MPC once the FOV
  // narrows — so a viewer who left the slider narrow must not carry it in.
  it('pins the FOV to the default and gives the viewer theirs back on exit', async () => {
    const { store, sagaMiddleware } = buildStore();
    const narrowed = DEFAULT_FOV_DEG / 3;
    store.dispatch(setFovDeg(narrowed));

    sagaMiddleware.run(function* () {
      yield* withSceneSnapshotSaga(waitingBody);
    });
    await flush();
    expect(store.getState().settings.camera.fovDeg).toBe(DEFAULT_FOV_DEG);

    store.dispatch(exitTakeover());
    await flush();
    expect(store.getState().settings.camera.fovDeg).toBe(narrowed);
  });

  it("restores the body's settings changes on exit", async () => {
    const { store, sagaMiddleware } = buildStore();
    store.dispatch(setCosmicWebDensityEnabled(true));

    sagaMiddleware.run(function* () {
      yield* withSceneSnapshotSaga(function* () {
        yield* put(setCosmicWebDensityEnabled(false));
        yield* take(exitTakeover);
      });
    });
    await flush();
    expect(store.getState().settings.cosmicWebDensity.enabled).toBe(false);

    store.dispatch(exitTakeover());
    await flush();
    expect(store.getState().settings.cosmicWebDensity.enabled).toBe(true);
  });
});
