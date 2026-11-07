import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchSkyClockToSaga } from '../../../src/state/sky/watchSkyClockToSaga';
import { skyClockTo } from '../../../src/state/sky/skyClockTo';
import { SKY_CLOCK_SKIP_MS } from '../../../src/data/sky/skyClockSkipMs';
import { goLive, setSimDays } from '../../../src/state/time/timeSlice';
import { selectTimeState } from '../../../src/state/time/selectors';

const FROM = 2_461_000.5;
const TO = FROM + 0.4;

function build() {
  const sagas = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g({ serializableCheck: false }).concat(sagas),
  });
  sagas.run(watchSkyClockToSaga);
  store.dispatch(goLive({ simDays: FROM, nowMs: performance.now() }));
  return store;
}

describe('watchSkyClockToSaga', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('sweeps, then lands paused exactly on the target', async () => {
    const store = build();
    store.dispatch(skyClockTo({ simDays: TO }));
    expect(selectTimeState(store.getState()).paused).toBe(false);
    expect(store.getState().time.profile).not.toBeNull();

    await vi.advanceTimersByTimeAsync(SKY_CLOCK_SKIP_MS + 1);
    const time = selectTimeState(store.getState());
    expect(time.paused).toBe(true);
    expect(time.anchor.simDays).toBeCloseTo(TO, 6);
    expect(store.getState().time.profile).toBeNull();
  });

  it('leaves a clock the visitor took over alone', async () => {
    const store = build();
    store.dispatch(skyClockTo({ simDays: TO }));
    store.dispatch(setSimDays({ simDays: FROM + 9, nowMs: performance.now() }));

    await vi.advanceTimersByTimeAsync(SKY_CLOCK_SKIP_MS + 1);
    const time = selectTimeState(store.getState());
    expect(time.paused).toBe(false);
    expect(time.anchor.simDays).toBe(FROM + 9);
  });
});
