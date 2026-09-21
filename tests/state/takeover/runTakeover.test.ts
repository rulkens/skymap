/**
 * runTakeover tests — the shared bracket tours and exhibits both run under:
 * snapshot → start → body → restore → end, with `takeoverEnded` suppressed on
 * a superseded (externally cancelled) run.
 *
 * `body` is a plain stub here — `runTakeover` is generic over its caller, so
 * these tests drive it directly with synthetic `TakeoverSource` values rather
 * than through the real tour/exhibit registries.
 *
 * Supersede ORDERING is not testable at this level: cancelling a `Task` from
 * plain test code runs the restore's `put`s synchronously, which a real
 * supersede does not. That ordering is owned by `watchTakeoverSaga` and tested
 * against the real watcher in `watchTakeoverSaga.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';
import { put, take } from 'typed-redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { runTakeover } from '../../../src/state/takeover/runTakeover';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { selectTourActive } from '../../../src/state/tour/selectors';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { setVolumesEnabled } from '../../../src/layers/volume/state/volumes/slice';
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

// Stands in for a real tour/exhibit body: parks until exitTakeover.
function* waitingBody(): Generator {
  yield* take(exitTakeover);
}

describe('runTakeover', () => {
  // The poses every takeover flies to are authored at the default lens, and a
  // fit-derived distance clamps silently at MAX_DISTANCE_MPC once the FOV
  // narrows — so a viewer who left the slider narrow must not carry it in.
  it('pins the FOV to the default and gives the viewer theirs back on exit', async () => {
    const { store, sagaMiddleware } = buildStore();
    const narrowed = DEFAULT_FOV_DEG / 3;
    store.dispatch(setFovDeg(narrowed));

    sagaMiddleware.run(function* () {
      yield* runTakeover({ kind: 'tour', id: 'grandTour' }, waitingBody);
    });
    await flush();
    expect(store.getState().settings.camera.fovDeg).toBe(DEFAULT_FOV_DEG);

    store.dispatch(exitTakeover());
    await flush();
    expect(store.getState().settings.camera.fovDeg).toBe(narrowed);
  });

  it('an exhibit restores its settings changes on exit', async () => {
    const { store, sagaMiddleware } = buildStore();
    store.dispatch(setVolumesEnabled(true));

    sagaMiddleware.run(function* () {
      yield* runTakeover({ kind: 'exhibit', id: 'solarSystem' }, function* () {
        yield* put(setVolumesEnabled(false));
        yield* take(exitTakeover);
      });
    });
    await flush();
    expect(store.getState().settings.volumes.enabled).toBe(false);

    store.dispatch(exitTakeover());
    await flush();
    expect(store.getState().settings.volumes.enabled).toBe(true);
  });

  it('a superseded run does not dispatch takeoverEnded', async () => {
    const { store, sagaMiddleware } = buildStore();

    const task = sagaMiddleware.run(function* () {
      yield* runTakeover({ kind: 'tour', id: 'demo' }, waitingBody);
    });
    await flush();
    expect(selectTakeoverSource(store.getState())).toEqual({ kind: 'tour', id: 'demo' });

    task.cancel();
    await flush();

    // No successor ever ran. If takeoverEnded had fired, `active` would be
    // null; the cancelled()-guard skips it, so the stale source stays put
    // until a real successor's takeoverStarted overwrites it.
    expect(selectTakeoverSource(store.getState())).toEqual({ kind: 'tour', id: 'demo' });
  });

  it('selectTourActive is still true for a running tour', async () => {
    const { store, sagaMiddleware } = buildStore();

    sagaMiddleware.run(function* () {
      yield* runTakeover({ kind: 'tour', id: 'demo' }, waitingBody);
    });
    await flush();

    expect(selectTourActive(store.getState())).toBe(true);
  });
});
