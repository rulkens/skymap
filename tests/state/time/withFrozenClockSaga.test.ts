/**
 * The restore paths a clip ends on are covered through `clipBodySaga.test.ts`;
 * this pins the one no clip reaches: a body that throws still gets the clock back.
 */
import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { setRate } from '../../../src/state/time/timeSlice';
import { withFrozenClockSaga } from '../../../src/state/time/withFrozenClockSaga';

describe('withFrozenClockSaga', () => {
  it('resumes a playing manual clock when the body throws', async () => {
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(sagaMiddleware),
    });
    store.dispatch(setRate({ rateIndex: 2, nowMs: 100 }));
    let pausedInBody = false;

    const task = sagaMiddleware.run(function* () {
      yield* withFrozenClockSaga(function* () {
        pausedInBody = store.getState().time.paused;
        throw new Error('factory failed');
      });
    });

    await expect(task.toPromise()).rejects.toThrow('factory failed');
    expect(pausedInBody).toBe(true);
    expect(store.getState().time).toMatchObject({ mode: 'manual', paused: false });
  });
});
