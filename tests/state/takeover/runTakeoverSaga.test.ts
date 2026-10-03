/**
 * runTakeoverSaga tests — the start → body → end bracket every takeover kind
 * runs under, with `takeoverEnded` suppressed on a superseded (externally
 * cancelled) run.
 *
 * `body` is a plain stub here — `runTakeoverSaga` is generic over its caller, so
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
import { take } from 'typed-redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { runTakeoverSaga } from '../../../src/state/takeover/runTakeoverSaga';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { selectTourActive } from '../../../src/state/tour/selectors';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';

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

describe('runTakeoverSaga', () => {
  it('a superseded run does not dispatch takeoverEnded', async () => {
    const { store, sagaMiddleware } = buildStore();

    const task = sagaMiddleware.run(function* () {
      yield* runTakeoverSaga({ kind: 'tour', id: 'demo' }, waitingBody);
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
      yield* runTakeoverSaga({ kind: 'tour', id: 'demo' }, waitingBody);
    });
    await flush();

    expect(selectTourActive(store.getState())).toBe(true);
  });
});
