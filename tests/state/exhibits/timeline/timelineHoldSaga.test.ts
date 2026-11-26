/**
 * The mission hold loop, run against the real store and the real voyager exhibit. Fake timers
 * drive both the profile's end-of-mission delay and `performance.now()`.
 */
import type { Mock } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { voyagerMissions } from '../../../../src/layers/missions/exhibits/voyagerMissions/voyagerMissions';
import { TIMELINE_SPEEDS } from '../../../../src/data/exhibits/timeline/timelineSpeeds';
import { MISSION_EVENTS } from '../../../../src/layers/missions/events/data/missionEvents.generated';
import { exhibitBodySaga } from '../../../../src/state/exhibits/exhibitBodySaga';
import { playTimeline } from '../../../../src/state/exhibits/timeline/playTimeline';
import {
  setTimelineLane,
  stepTimelineSpeed,
} from '../../../../src/state/settings/core/timelineSlice';
import { exitTakeover } from '../../../../src/state/takeover/takeoverActions';
import {
  pause,
  resume,
  setSimDays,
  goLive,
  stepToEvent,
} from '../../../../src/state/time/timeSlice';
import { rootReducer } from '../../../../src/store/rootReducer';
import { deriveSimDays } from '../../../../src/utils/time/deriveSimDays';
import { timelineEventMs } from '../../../../src/utils/exhibits/timeline/timelineEventMs';
import { timelineEventStepMs } from '../../../../src/utils/exhibits/timeline/timelineEventStepMs';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { loadVoyagerStopWindows } from '../../../helpers/missions/loadVoyagerStopWindows';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { Transition } from '../../../../src/@types/navigation/Transition';

beforeAll(loadVoyagerStopWindows);
beforeEach(() => vi.useFakeTimers({ now: Date.parse('2026-10-06') }));
afterEach(() => vi.useRealTimers());

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const eventDays = (id: string) =>
  unixMsToJulianDays(timelineEventMs(MISSION_EVENTS.find((e) => e.id === id)!));

let linkedDays = 0;

async function hold(
  entry: Transition = 'cut',
  playClip: Mock<(clip: ClipData) => Promise<void>> = vi.fn().mockResolvedValue(undefined),
  atLinkedTime = false,
) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(sagaMiddleware),
  });
  // Live and running, as the app boots: entry must stop it.
  store.dispatch(resume({ nowMs: performance.now() }));
  if (atLinkedTime) {
    const nowMs = performance.now();
    store.dispatch(setSimDays({ simDays: linkedDays, nowMs }));
    store.dispatch(pause({ nowMs }));
  }
  const runtime = { fovYRad: 0.9, aspect: 16 / 9 };
  sagaMiddleware.setContext({ playClip, cameraRuntime: () => runtime });
  sagaMiddleware.run(function* () {
    yield* exhibitBodySaga(voyagerMissions, entry, atLinkedTime);
  });
  await tick();
  const step = (eventId: string) => {
    const event = MISSION_EVENTS.find((e) => e.id === eventId)!;
    const simDays = unixMsToJulianDays(timelineEventStepMs(event));
    store.dispatch(stepToEvent({ eventId, simDays, nowMs: performance.now() }));
  };
  const simDays = () => deriveSimDays(store.getState().time, performance.now());
  return { store, playClip, step, simDays };
}

describe('mission hold loop', () => {
  it('opens paused at the selected craft’s launch with the mission camera on it', async () => {
    const { store, simDays } = await hold();
    const s = store.getState();
    expect(s.time.paused).toBe(true);
    expect(simDays()).toBeCloseTo(eventDays('voyager1-launch'), 9);
    expect(s.settings.timeline.lane).toBe('voyager1');
    expect(s.camera.intent.aim).toEqual({ ease: false });
  });

  it('flies in to the mission camera’s launch pose on a fly entry', async () => {
    const { playClip } = await hold('fly');
    expect(playClip).toHaveBeenCalledTimes(1);
  });

  it('steps to a flyby two days early and plays', async () => {
    const { store, step, simDays } = await hold();
    store.dispatch(setTimelineLane('voyager2'));
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

  it('lifts the clock to the new craft’s launch on a tab switch, and keeps a later instant', async () => {
    const { store, simDays } = await hold();
    const nowMs = performance.now();
    store.dispatch(setSimDays({ simDays: eventDays('voyager2-launch'), nowMs }));
    store.dispatch(setTimelineLane('voyager1'));
    await tick();
    expect(simDays()).toBeCloseTo(eventDays('voyager1-launch'), 9);
    store.dispatch(setSimDays({ simDays: eventDays('voyager1-jupiter'), nowMs }));
    store.dispatch(setTimelineLane('voyager2'));
    await tick();
    expect(simDays()).toBeCloseTo(eventDays('voyager1-jupiter'), 9);
  });

  it('carries a clock at one craft’s launch to the other’s launch on a tab switch', async () => {
    const { store, simDays } = await hold();
    expect(simDays()).toBeCloseTo(eventDays('voyager1-launch'), 9);
    store.dispatch(setTimelineLane('voyager2'));
    await tick();
    expect(simDays()).toBeCloseTo(eventDays('voyager2-launch'), 9);
  });

  it('plays to now and pauses there', async () => {
    const { store, simDays } = await hold();
    store.dispatch(playTimeline());
    await tick();
    const wall = store.getState().time.profile!.wallMs.at(-1)!;
    await tick(wall + 100);
    expect(store.getState().time.paused).toBe(true);
    expect(simDays()).toBeCloseTo(unixMsToJulianDays(Date.parse('2026-10-06')), 3);
  });

  it('rebuilds the profile one speed factor up, and never lets the old end pause fire', async () => {
    const { store } = await hold();
    store.dispatch(playTimeline());
    await tick();
    const first = store.getState().time.profile!;
    store.dispatch(stepTimelineSpeed({ step: 1 }));
    await tick();
    const second = store.getState().time.profile!;
    expect(second).not.toBe(first);
    expect(store.getState().settings.timeline.speed).toBe(2);
    await tick(second.wallMs.at(-1)! - 100);
    expect(store.getState().time.paused).toBe(false);
  });

  it('does not re-pause a clock the visitor restarted', async () => {
    const { store } = await hold();
    store.dispatch(playTimeline());
    await tick();
    const wall = store.getState().time.profile!.wallMs.at(-1)!;
    store.dispatch(pause({ nowMs: performance.now() }));
    store.dispatch(goLive({ simDays: eventDays('voyager1-jupiter'), nowMs: performance.now() }));
    await tick(wall + 100);
    expect(store.getState().time.paused).toBe(false);
  });

  it('stops listening on exit', async () => {
    const { store } = await hold();
    store.dispatch(exitTakeover());
    await tick();
    store.dispatch(playTimeline());
    await tick();
    expect(store.getState().time.profile).toBeNull();
  });

  const never = () => vi.fn<(clip: ClipData) => Promise<void>>(() => new Promise(() => {}));

  it('a tab click during the fly-in re-aims the camera', async () => {
    const { store } = await hold('fly', never());
    store.dispatch(setTimelineLane('voyager2'));
    await tick();
    expect(store.getState().camera.intent.aim).toEqual({ ease: true });
  });

  it('run, speed and a flyby step during the fly-in take effect', async () => {
    const { store, step } = await hold('fly', never());
    store.dispatch(playTimeline());
    await tick();
    expect(store.getState().time.profile).not.toBeNull();
    store.dispatch(stepTimelineSpeed({ step: 1 }));
    await tick();
    expect(store.getState().settings.timeline.speed).toBe(2);
    step('voyager1-jupiter');
    await tick();
    expect(store.getState().time.profile).not.toBeNull();
  });

  it('a resume from outside the exhibit UI plays the mission profile', async () => {
    const { store } = await hold();
    store.dispatch(resume({ nowMs: performance.now() }));
    await tick();
    expect(store.getState().time.profile).not.toBeNull();
    expect(store.getState().time.paused).toBe(false);
  });

  it('a scrub while playing keeps playing the profile from the scrubbed instant', async () => {
    const { store, simDays } = await hold();
    store.dispatch(playTimeline());
    await tick(500);
    const to = eventDays('voyager1-saturn');
    store.dispatch(setSimDays({ simDays: to, nowMs: performance.now() }));
    await tick(1000);
    const s = store.getState();
    expect(s.time.paused).toBe(false);
    expect(s.time.profile).not.toBeNull();
    expect(s.time.profile!.simDays[0]).toBeCloseTo(to, 6);
    expect(simDays()).toBeGreaterThan(to);
  });

  it('a scrub while paused stays paused', async () => {
    const { store } = await hold();
    store.dispatch(setSimDays({ simDays: eventDays('voyager1-saturn'), nowMs: performance.now() }));
    await tick(1000);
    expect(store.getState().time.profile).toBeNull();
  });

  it('opens with the speed factor in the store, and − / + while paused only change it', async () => {
    const { store, simDays } = await hold();
    const at = simDays();
    expect(store.getState().settings.timeline.speed).toBe(1);
    store.dispatch(stepTimelineSpeed({ step: 1 }));
    await tick(1000);
    const s = store.getState();
    expect(s.settings.timeline.speed).toBe(2);
    expect(s.time.paused).toBe(true);
    expect(s.time.profile).toBeNull();
    expect(simDays()).toBeCloseTo(at, 9);
  });

  it('the speed factor stops at the ladder ends and survives a step', async () => {
    const { store, step } = await hold();
    for (let i = 0; i < 9; i++) store.dispatch(stepTimelineSpeed({ step: -1 }));
    await tick();
    expect(store.getState().settings.timeline.speed).toBe(TIMELINE_SPEEDS[0]);
    step('voyager1-pale-blue-dot');
    await tick();
    expect(store.getState().settings.timeline.speed).toBe(TIMELINE_SPEEDS[0]);
  });

  it('− / + at the end of the mission leave the clock at now; only run replays', async () => {
    const { store, simDays } = await hold();
    store.dispatch(playTimeline());
    await tick();
    await tick(store.getState().time.profile!.wallMs.at(-1)! + 100);
    const end = simDays();
    store.dispatch(stepTimelineSpeed({ step: 1 }));
    await tick(1000);
    expect(simDays()).toBeCloseTo(end, 9);
    expect(store.getState().time.profile).toBeNull();
    store.dispatch(playTimeline());
    await tick();
    expect(store.getState().time.profile!.simDays[0]).toBeCloseTo(eventDays('voyager1-launch'), 9);
  });

  it('a linked time wins over the launch, clamped up to it', async () => {
    linkedDays = eventDays('voyager1-jupiter') + 3;
    const { simDays } = await hold('cut', undefined, true);
    expect(simDays()).toBeCloseTo(linkedDays, 9);
  });

  it('a linked time before the launch lands on the launch', async () => {
    linkedDays = eventDays('voyager1-launch') - 100;
    const { simDays } = await hold('cut', undefined, true);
    expect(simDays()).toBeCloseTo(eventDays('voyager1-launch'), 9);
  });

  it('a step and a tab switch re-aim the camera with an ease', async () => {
    const { store, step } = await hold();
    const entry = store.getState().camera.intent.aim;
    expect(entry).toEqual({ ease: false });
    step('voyager1-pale-blue-dot');
    await tick();
    const afterStep = store.getState().camera.intent.aim;
    expect(afterStep).toEqual({ ease: true });
    expect(afterStep).not.toBe(entry);
    store.dispatch(setTimelineLane('voyager2'));
    await tick();
    const afterTab = store.getState().camera.intent.aim;
    expect(afterTab).toEqual({ ease: true });
    expect(afterTab).not.toBe(afterStep);
  });
});
