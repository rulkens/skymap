/**
 * The exhibit hold loop's ride handling, run against the real store and the real voyager exhibit.
 * Fake timers drive both the ride's end-of-profile delay and `performance.now()`.
 */
import type { Mock } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware, { CANCEL } from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { RIDE_WALL_MS } from '../../../src/data/exhibits/ride/rideWallMs';
import { voyager } from '../../../src/data/exhibits/voyager';
import { MISSION_EVENTS } from '../../../src/data/missions/missionEvents.generated';
import { trajectoryRegistry } from '../../../src/services/bodies/trajectoryRegistry';
import { exhibitBodySaga } from '../../../src/state/exhibits/exhibitBodySaga';
import { showWholeMission } from '../../../src/state/exhibits/showWholeMission';
import { stepToMissionEvent } from '../../../src/state/exhibits/stepToMissionEvent';
import { setMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/slice';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { pause, restoreTime, resume } from '../../../src/state/time/timeSlice';
import { rootReducer } from '../../../src/store/rootReducer';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { missionEventMs } from '../../../src/utils/exhibits/timeline/missionEventMs';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import V1 from '../../fixtures/voyager1TitanFlyby.json';
import V2 from '../../fixtures/voyager2NeptuneFlyby.json';

beforeAll(() => {
  for (const [id, f] of [
    ['voyager1', V1],
    ['voyager2', V2],
  ] as const) {
    trajectoryRegistry.set({
      id,
      tDays: Float64Array.from(f.track.tDays),
      posKm: Float64Array.from(f.track.posKm),
      velKmS: Float32Array.from(f.track.velKmS),
    });
  }
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const eventDays = (id: string) =>
  unixMsToJulianDays(missionEventMs(MISSION_EVENTS.find((e) => e.id === id)!));

async function hold(
  playClip: Mock<(clip: ClipData) => Promise<void>> = vi.fn().mockResolvedValue(undefined),
) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({ playClip, cameraRuntime: () => null });
  sagaMiddleware.run(function* () {
    yield* exhibitBodySaga(voyager, 'cut');
  });
  await tick();
  const step = (eventId: string) =>
    store.dispatch(stepToMissionEvent({ eventId, nowMs: performance.now() }));
  return { store, playClip, step };
}

describe('exhibit hold loop — flyby rides', () => {
  it('starts a ride on a flyby step', async () => {
    const { store, step } = await hold();
    step('voyager2-neptune');
    await tick();
    expect(store.getState().time.profile).not.toBeNull();
    expect(store.getState().camera.ride?.eventId).toBe('voyager2-neptune');
  });

  it('flies back to the exhibit pose when a step leaves a ride', async () => {
    const { store, playClip, step } = await hold();
    step('voyager2-neptune');
    await tick();
    step('voyager1-pale-blue-dot');
    await tick();
    expect(store.getState().camera.ride).toBeNull();
    expect(playClip).toHaveBeenCalledTimes(1);
  });

  it('lets a fly-back finish when another non-flyby step lands during it', async () => {
    const stopped = vi.fn();
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>(() => {
      const pending = new Promise<void>(() => {}) as Promise<void> & { [CANCEL]?: () => void };
      pending[CANCEL] = stopped;
      return pending;
    });
    const { step } = await hold(playClip);
    step('voyager2-neptune');
    await tick();
    step('voyager1-pale-blue-dot');
    await tick(1000);
    step('voyager1-pioneer10');
    await tick();
    expect(stopped).not.toHaveBeenCalled();
    expect(playClip).toHaveBeenCalledTimes(1);
  });

  it('leaves the camera alone when a non-flyby step arrives outside a ride', async () => {
    const { playClip, step } = await hold();
    step('voyager1-pale-blue-dot');
    await tick();
    expect(playClip).not.toHaveBeenCalled();
  });

  it('flies back and clears the ride on a craft-tab switch', async () => {
    const { store, playClip, step } = await hold();
    step('voyager2-neptune');
    await tick(1000);
    store.dispatch(setMissionEmphasis('voyager1'));
    await tick();
    expect(store.getState().camera.ride).toBeNull();
    expect(playClip).toHaveBeenCalledTimes(1);
  });

  it('flies back and clears the ride on showWholeMission', async () => {
    const { store, playClip, step } = await hold();
    step('voyager2-neptune');
    await tick(1000);
    store.dispatch(showWholeMission());
    await tick();
    expect(store.getState().camera.ride).toBeNull();
    expect(playClip).toHaveBeenCalledTimes(1);
  });

  it('clears the ride on exit, and a restored clock carries no profile', async () => {
    const { store, step } = await hold();
    const captured = store.getState().time;
    step('voyager2-neptune');
    await tick(1000);
    store.dispatch(exitTakeover());
    await tick();
    expect(store.getState().camera.ride).toBeNull();
    store.dispatch(
      restoreTime({ captured, simDays: captured.anchor.simDays, nowMs: performance.now() }),
    );
    expect(store.getState().time.profile).toBeNull();
  });

  it('never lets the first ride’s pause fire into the second', async () => {
    const { store, step } = await hold();
    step('voyager1-titan');
    await tick(10_000);
    step('voyager1-saturn');
    // Past the first ride's 25 s end, short of the second's.
    await tick(RIDE_WALL_MS - 10_000 + 5_000);
    const s = store.getState();
    expect(s.time.profile).not.toBeNull();
    expect(s.time.paused).toBe(false);
    expect(s.camera.ride?.eventId).toBe('voyager1-saturn');
    await tick(RIDE_WALL_MS);
    expect(store.getState().time.paused).toBe(true);
  });

  it('keeps the ride camera and freezes the clock where a visitor pause lands', async () => {
    const { store, step } = await hold();
    step('voyager2-neptune');
    await tick(12_000);
    const at = deriveSimDays(store.getState().time, performance.now());
    store.dispatch(pause({ nowMs: performance.now() }));
    await tick(RIDE_WALL_MS);
    const s = store.getState();
    expect(s.time.profile).toBeNull();
    expect(s.camera.ride).not.toBeNull();
    expect(deriveSimDays(s.time, performance.now())).toBeCloseTo(at, 9);
  });

  it('does not re-pause a clock the visitor restarted', async () => {
    const { store, step } = await hold();
    step('voyager2-neptune');
    await tick(5_000);
    store.dispatch(pause({ nowMs: performance.now() }));
    store.dispatch(resume({ nowMs: performance.now() }));
    await tick(RIDE_WALL_MS);
    expect(store.getState().time.paused).toBe(false);
  });

  it('pauses at closest + 2 d when the ride ends, camera still riding', async () => {
    const { store, step } = await hold();
    step('voyager2-neptune');
    await tick(RIDE_WALL_MS + 100);
    const s = store.getState();
    expect(s.time.paused).toBe(true);
    expect(s.camera.ride).not.toBeNull();
    expect(deriveSimDays(s.time, performance.now())).toBeCloseTo(
      eventDays('voyager2-neptune') + 2,
      6,
    );
  });
});
