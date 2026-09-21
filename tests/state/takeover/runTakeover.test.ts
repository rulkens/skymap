/**
 * runTakeover tests — the shared bracket tours and views both run under:
 * snapshot → start → body → restore → end, with `takeoverEnded` suppressed on
 * a superseded (externally cancelled) run.
 *
 * `body` is a plain stub here — `runTakeover` is generic over its caller, so
 * these tests drive it directly with synthetic `TakeoverSource` values rather
 * than through the real tour/view registries.
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

const flush = () => new Promise((r) => setTimeout(r, 0));

function buildStore() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  return { store, sagaMiddleware };
}

// Stands in for a real tour/view body: parks until exitTakeover.
function* waitingBody(): Generator {
  yield* take(exitTakeover);
}

describe('runTakeover', () => {
  it('a view restores its settings and toggle changes on exit', async () => {
    const { store, sagaMiddleware } = buildStore();
    store.dispatch(setVolumesEnabled(true));

    sagaMiddleware.run(function* () {
      yield* runTakeover({ kind: 'view', id: 'solarSystem' }, function* () {
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
