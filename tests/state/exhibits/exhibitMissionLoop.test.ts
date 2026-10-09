/**
 * The mission hold loop, run against the real store and the real voyager exhibit. Fake timers
 * drive both the profile's end-of-mission delay and `performance.now()`.
 */
import type { Mock } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { voyager } from '../../../src/data/exhibits/voyager';
import { MISSION_EVENTS } from '../../../src/data/missions/missionEvents.generated';
import { setMissionOffsets } from '../../../src/state/camera/cameraSlice';
import { exhibitBodySaga } from '../../../src/state/exhibits/exhibitBodySaga';
import { playMission } from '../../../src/state/exhibits/playMission';
import { stepMissionSpeed } from '../../../src/state/exhibits/stepMissionSpeed';
import { stepToMissionEvent } from '../../../src/state/exhibits/stepToMissionEvent';
import { setMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/slice';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { pause, resume, setSimDays } from '../../../src/state/time/timeSlice';
import { rootReducer } from '../../../src/store/rootReducer';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { missionEventMs } from '../../../src/utils/exhibits/timeline/missionEventMs';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { loadVoyagerStopWindows } from '../../helpers/missions/loadVoyagerStopWindows';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { Transition } from '../../../src/@types/navigation/Transition';

beforeAll(loadVoyagerStopWindows);
beforeEach(() => vi.useFakeTimers({ now: Date.parse('2026-10-06') }));
afterEach(() => vi.useRealTimers());

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const eventDays = (id: string) =>
  unixMsToJulianDays(missionEventMs(MISSION_EVENTS.find((e) => e.id === id)!));

async function hold(
  entry: Transition = 'cut',
  playClip: Mock<(clip: ClipData) => Promise<void>> = vi.fn().mockResolvedValue(undefined),
) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(sagaMiddleware),
  });
  // Live and running, as the app boots: entry must stop it.
  store.dispatch(resume({ nowMs: performance.now() }));
  const runtime = { fovYRad: 0.9, aspect: 16 / 9 };
  sagaMiddleware.setContext({ playClip, cameraRuntime: () => runtime });
  sagaMiddleware.run(function* () {
    yield* exhibitBodySaga(voyager, entry);
  });
  await tick();
  const step = (eventId: string) =>
    store.dispatch(stepToMissionEvent({ eventId, nowMs: performance.now() }));
  const simDays = () => deriveSimDays(store.getState().time, performance.now());
  return { store, playClip, step, simDays };
}

describe('mission hold loop', () => {
  it('opens paused at the selected craft’s launch with the mission camera on it', async () => {
    const { store, simDays } = await hold();
    const s = store.getState();
    expect(s.time.paused).toBe(true);
    expect(simDays()).toBeCloseTo(eventDays('voyager1-launch'), 9);
    expect(s.camera.mission?.craftId).toBe('voyager1');
  });

  it('flies in to the mission camera’s launch pose on a fly entry', async () => {
    const { playClip } = await hold('fly');
    expect(playClip).toHaveBeenCalledTimes(1);
  });

  it('steps to a flyby two days early and plays', async () => {
    const { store, step, simDays } = await hold();
    store.dispatch(setMissionEmphasis('voyager2'));
    await tick();
    step('voyager2-neptune');
    await tick();
    const s = store.getState();
    expect(s.time.paused).toBe(false);
    expect(s.time.profile).not.toBeNull();
    expect(simDays()).toBeCloseTo(eventDays('voyager2-neptune') - 2, 6);
  });

  it('steps to any other event at its instant, paused', async () => {
    const { store, step, simDays } = await hold();
    step('voyager1-jupiter');
    await tick(1000);
    step('voyager1-pale-blue-dot');
    await tick(1000);
    const s = store.getState();
    expect(s.time.paused).toBe(true);
    expect(s.time.profile).toBeNull();
    expect(simDays()).toBeCloseTo(eventDays('voyager1-pale-blue-dot'), 9);
  });

  it('resets the visitor’s offsets on a step', async () => {
    const { store, step } = await hold();
    store.dispatch(setMissionOffsets({ yaw: 0.3, pitch: 0.1, zoom: 2 }));
    step('voyager1-pale-blue-dot');
    await tick();
    expect(store.getState().camera.mission?.offsets).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
  });

  it('lifts the clock to the new craft’s launch on a tab switch, and keeps a later instant', async () => {
    const { store, simDays } = await hold();
    const nowMs = performance.now();
    store.dispatch(setSimDays({ simDays: eventDays('voyager2-launch'), nowMs }));
    store.dispatch(setMissionEmphasis('voyager1'));
    await tick();
    expect(simDays()).toBeCloseTo(eventDays('voyager1-launch'), 9);
    store.dispatch(setSimDays({ simDays: eventDays('voyager1-jupiter'), nowMs }));
    store.dispatch(setMissionEmphasis('voyager2'));
    await tick();
    expect(simDays()).toBeCloseTo(eventDays('voyager1-jupiter'), 9);
    expect(store.getState().camera.mission?.craftId).toBe('voyager2');
  });

  it('plays to now and pauses there', async () => {
    const { store, simDays } = await hold();
    store.dispatch(playMission());
    await tick();
    const wall = store.getState().time.profile!.wallMs.at(-1)!;
    await tick(wall + 100);
    expect(store.getState().time.paused).toBe(true);
    expect(simDays()).toBeCloseTo(unixMsToJulianDays(Date.parse('2026-10-06')), 3);
  });

  it('rebuilds the profile one speed factor up, and never lets the old end pause fire', async () => {
    const { store } = await hold();
    store.dispatch(playMission());
    await tick();
    const first = store.getState().time.profile!;
    store.dispatch(stepMissionSpeed({ step: 1 }));
    await tick();
    const second = store.getState().time.profile!;
    expect(second.speedIndex).toBe(first.speedIndex + 1);
    await tick(second.wallMs.at(-1)! - 100);
    expect(store.getState().time.paused).toBe(false);
  });

  it('does not re-pause a clock the visitor restarted', async () => {
    const { store } = await hold();
    store.dispatch(playMission());
    await tick();
    const wall = store.getState().time.profile!.wallMs.at(-1)!;
    store.dispatch(pause({ nowMs: performance.now() }));
    store.dispatch(resume({ nowMs: performance.now() }));
    await tick(wall + 100);
    expect(store.getState().time.paused).toBe(false);
  });

  it('clears the mission on exit', async () => {
    const { store } = await hold();
    store.dispatch(playMission());
    await tick(1000);
    store.dispatch(exitTakeover());
    await tick();
    expect(store.getState().camera.mission).toBeNull();
  });
});
