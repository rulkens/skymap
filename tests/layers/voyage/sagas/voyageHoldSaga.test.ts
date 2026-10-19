/**
 * The voyage hold loop against the real store, opened as the exhibit opens it (its settings
 * merged inside the takeover's scene bracket). Fake timers drive both the profile's end delay
 * and `performance.now()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';
import { put } from 'typed-redux-saga';

import { JULIAN_YEAR_DAYS } from '../../../../src/data/time/julianYearDays';
import { VOYAGE_DESTINATIONS } from '../../../../src/data/voyage/voyageDestinations';
import { initialState as voyageInitialState } from '../../../../src/layers/voyage/state/voyage/initialState';
import { playVoyage } from '../../../../src/layers/voyage/exhibits/playVoyage';
import { voyageHoldSaga } from '../../../../src/layers/voyage/sagas/voyageHoldSaga';
import { selectFrameBoost } from '../../../../src/layers/voyage/state/voyage/selectors';
import { mergeSnapshot } from '../../../../src/state/settings/mergeSnapshotAction';
import { withSceneSnapshotSaga } from '../../../../src/state/takeover/withSceneSnapshotSaga';
import { watchTakeoverSaga } from '../../../../src/state/takeover/watchTakeoverSaga';
import { openExhibit } from '../../../../src/state/exhibits/exhibitActions';
import { exitTakeover } from '../../../../src/state/takeover/takeoverActions';
import { resume, setSimDays } from '../../../../src/state/time/timeSlice';
import { rootReducer } from '../../../../src/store/rootReducer';
import { tripOf } from '../../../../src/utils/relativity/tripOf';
import { deriveSimDays } from '../../../../src/utils/time/deriveSimDays';
import { voyageTripLy } from '../../../../src/utils/voyage/voyageTripLy';

beforeEach(() => vi.useFakeTimers({ now: Date.parse('2026-10-06') }));
afterEach(() => vi.useRealTimers());

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const arrivalYr = (id: keyof typeof VOYAGE_DESTINATIONS) =>
  tripOf(voyageTripLy(VOYAGE_DESTINATIONS[id])).tEarthTotalYr;

function hold() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(sagaMiddleware),
  });
  // Live and running, as the app boots: entry must stop it.
  store.dispatch(resume({ nowMs: performance.now() }));
  const openedAt = deriveSimDays(store.getState().time, performance.now());
  sagaMiddleware.setContext({ playClip: vi.fn().mockResolvedValue(undefined) });
  sagaMiddleware.run(function* () {
    yield* withSceneSnapshotSaga(function* () {
      yield* put(mergeSnapshot({ voyage: { ...voyageInitialState, destination: 'm31' } }));
      yield* voyageHoldSaga({ heading: 'Voyage' }, 'cut', false);
    });
  });
  const simDays = () => deriveSimDays(store.getState().time, performance.now());
  return { store, simDays, openedAt };
}

function takeovers() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({ playClip: vi.fn().mockResolvedValue(undefined) });
  sagaMiddleware.run(watchTakeoverSaga);
  const simDays = () => deriveSimDays(store.getState().time, performance.now());
  return { store, simDays };
}

describe('voyage hold loop', () => {
  it('opening launches now, paused', async () => {
    const { store, simDays, openedAt } = hold();
    await tick(1000);
    const s = store.getState();
    expect(s.time.paused).toBe(true);
    expect(s.settings.voyage.launchDays).toBe(openedAt);
    expect(simDays()).toBe(openedAt);
    expect(s.camera.aim).toEqual({ ease: false });
  });

  it('play starts a profile ending at arrival', async () => {
    const { store, simDays } = hold();
    const launch = store.getState().settings.voyage.launchDays!;
    store.dispatch(playVoyage());
    await tick();
    const profile = store.getState().time.profile!;
    expect(profile.simDays.at(-1)!).toBeCloseTo(launch + arrivalYr('m31') * JULIAN_YEAR_DAYS, 3);
    await tick(profile.wallMs.at(-1)! + 100);
    expect(store.getState().time.paused).toBe(true);
    expect(simDays()).toBeCloseTo(launch + arrivalYr('m31') * JULIAN_YEAR_DAYS, 3);
  });

  it('a scrub while playing rebuilds from the scrubbed instant', async () => {
    const { store, simDays } = hold();
    const launch = store.getState().settings.voyage.launchDays!;
    store.dispatch(playVoyage());
    await tick(500);
    const to = launch + 1e6 * JULIAN_YEAR_DAYS;
    store.dispatch(setSimDays({ simDays: to, nowMs: performance.now() }));
    await tick(1000);
    const s = store.getState();
    expect(s.time.paused).toBe(false);
    expect(s.time.profile!.simDays[0]).toBe(to);
    expect(simDays()).toBeGreaterThan(to);
  });

  // A tab opens the sibling exhibit: the swap must land the new trip, not the outgoing restore.
  it('a destination tab swaps to the sibling exhibit, launched and held there', async () => {
    const { store, simDays } = takeovers();
    store.dispatch(openExhibit({ id: 'voyage-m31', entry: 'cut' }));
    await tick(1000);
    store.dispatch(playVoyage());
    await tick(500);
    const pose = store.getState().camera.base;
    store.dispatch(openExhibit({ id: 'voyage-proxima', entry: 'cut' }));
    await tick(1000);
    const s = store.getState();
    expect(s.takeover.active).toMatchObject({ kind: 'exhibit', id: 'voyage-proxima' });
    expect(s.settings.voyage.destination).toBe('proxima');
    expect(s.time.paused).toBe(true);
    expect(s.time.profile).toBeNull();
    expect(simDays()).toBe(s.settings.voyage.launchDays);
    expect(s.camera.base).toEqual(pose);
  });

  it('exit cancels the play task and restores the rest frame', async () => {
    const { store } = hold();
    store.dispatch(playVoyage());
    await tick(500);
    store.dispatch(exitTakeover());
    await tick();
    const s = store.getState();
    expect(s.time.profile).toBeNull();
    expect(s.settings.voyage.destination).toBeNull();
    expect(selectFrameBoost(s, deriveSimDays(s.time, performance.now()))).toBeNull();
    store.dispatch(playVoyage());
    await tick();
    expect(store.getState().time.profile).toBeNull();
  });
});
