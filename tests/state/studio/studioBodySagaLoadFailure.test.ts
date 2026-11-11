/**
 * A failed studio chunk load (offline, a stale deploy) must end the takeover, not throw into
 * `watchTakeoverSaga`, whose death would stop every app saga. Its own file: the mock factory throws,
 * and a module mock is cached per file.
 */
import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../../../packages/studio/src/studioEntry', () => {
  throw new Error('chunk load failed');
});

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTakeoverSaga } from '../../../src/state/takeover/watchTakeoverSaga';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { openStudio } from '../../../src/state/studio/studioActions';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('studioBodySaga load failure', () => {
  it('ends the takeover and leaves the watcher alive', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mw = createSagaMiddleware();
    const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    const watcher = mw.run(watchTakeoverSaga);

    store.dispatch(openStudio('cosmicFlows'));
    await flush();

    expect(selectTakeoverSource(store.getState())).toBeNull();
    expect(watcher.isRunning()).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
