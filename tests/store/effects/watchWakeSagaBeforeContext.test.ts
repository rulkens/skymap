/**
 * A wake-route write can land before the engine registers its saga context:
 * the phone's cover probe measures on mount, ahead of engine construction.
 * The wake watcher must survive that write, or the throw cancels every saga.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchWakeSaga } from '../../../src/store/effects/watchWakeSaga';
import { sagaContextRegistered } from '../../../src/store/sagaContextRegistered';
import { viewCoverSet } from '../../../src/state/viewCover/viewCoverSlice';

describe('watchWakeSaga before the saga context exists', () => {
  it('survives a pre-context wake write and wakes once the context is registered', () => {
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(sagaMiddleware),
    });
    const task = sagaMiddleware.run(watchWakeSaga);

    store.dispatch(
      viewCoverSet({
        id: 'phoneBottom',
        cover: { edge: 'bottom', reachPx: 120, spanPx: [0, 400] },
      }),
    );
    expect(task.isRunning()).toBe(true);

    const requestRender = vi.fn();
    sagaMiddleware.setContext({ reconcile: { requestRender } });
    store.dispatch(sagaContextRegistered());
    store.dispatch(
      viewCoverSet({
        id: 'phoneBottom',
        cover: { edge: 'bottom', reachPx: 140, spanPx: [0, 400] },
      }),
    );

    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});
