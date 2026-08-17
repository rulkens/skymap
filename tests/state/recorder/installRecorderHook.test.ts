// @vitest-environment jsdom
/**
 * installRecorderHook — the `window.__skymapRecorder` seam the recorder
 * harness drives through.
 *
 * The store is the REAL `rootReducer` behind a plain `configureStore` (the
 * guidedTourSaga suite's buildStore pattern) — no saga middleware, because
 * these tests drive the tour slice directly (`tourStarted` / `tourEnded`
 * stand in for the saga's writes) and running the real root saga would need
 * the whole engine context. A recording middleware captures dispatched
 * actions so the `startTour` payload contract (`{ id, beats }`) is asserted
 * on the actual action, not on state.
 *
 * `isCinemaMode` is module-mocked (same technique as App.cinema.test.tsx):
 * the installer reads it per call, so flipping `mockReturnValue` covers both
 * the gate's no-op branch and the installed branch in one file.
 *
 * The `ready` tests run under fake timers so the READY_STABLE_MS stability
 * window elapses instantly — the contract under test is that a momentary
 * true reading of the ready predicate does NOT resolve the promise (the
 * load-progress aggregate is null before the first slot starts, so the
 * predicate flickers true mid-bootstrap); only an undisturbed window does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { installRecorderHook } from '../../../src/state/recorder/installRecorderHook';
import { READY_STABLE_MS } from '../../../src/state/lifecycle/whenStablyReady';
import { startTour } from '../../../src/state/tour/tourActions';
import { tourStarted, tourEnded } from '../../../src/state/tour/tourSlice';
import { startClip } from '../../../src/state/camera/clipActions';
import { clipStarted, clipEnded } from '../../../src/state/camera/cameraSlice';
import {
  engineStatusChanged,
  engineLoadProgressChanged,
} from '../../../src/state/engine/engineSlice';
import { Source } from '../../../src/data/sources';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { isCinemaMode } from '../../../src/utils/url/isCinemaMode';
import type { SkymapRecorderHook } from '../../../src/@types/recorder/SkymapRecorderHook';
import type { RecorderWindow } from '../../../src/@types/recorder/RecorderWindow';
import type { BeatRange } from '../../../src/@types/animation/tour/BeatRange';
import type { ClipData } from '../../../src/@types/animation/ClipData';

vi.mock('../../../src/utils/url/isCinemaMode', () => ({
  isCinemaMode: vi.fn<() => boolean>(() => false),
}));

const getHook = (): SkymapRecorderHook | undefined => (window as RecorderWindow).__skymapRecorder;

// Real reducer + a recording middleware, so tests can assert on the exact
// actions the hook dispatches while state transitions stay authentic.
function buildStore() {
  const actions: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    actions.push(action as UnknownAction);
    return next(action);
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(record),
  });
  return { store, actions };
}

describe('installRecorderHook', () => {
  beforeEach(() => {
    delete (window as RecorderWindow).__skymapRecorder;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('installRecorderHook is a no-op outside cinema mode', () => {
    vi.mocked(isCinemaMode).mockReturnValue(false);
    const { store } = buildStore();

    installRecorderHook(store);

    expect(getHook()).toBeUndefined();
  });

  it('installRecorderHook exposes the hook in cinema mode', () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store } = buildStore();

    installRecorderHook(store);

    const hook = getHook();
    expect(hook).toBeDefined();
    expect(hook?.ready).toBeInstanceOf(Promise);
    expect(typeof hook?.startTour).toBe('function');
  });

  it('ready resolves once the engine is ready and load progress has settled', async () => {
    vi.useFakeTimers();
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store } = buildStore();
    installRecorderHook(store);
    const hook = getHook();
    if (!hook) throw new Error('hook not installed');

    let settled = false;
    void hook.ready.then(() => {
      settled = true;
    });

    // The engine turns ready while loadProgress is still null (no slot has
    // started yet) — the predicate flickers true...
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 100, source: Source.SDSS }));
    // ...then the first fetch registers within the stability window. The
    // flicker must NOT resolve `ready`, even well past the window.
    store.dispatch(engineLoadProgressChanged({ loadedBytes: 0, totalBytes: 10, inFlightCount: 1 }));
    await vi.advanceTimersByTimeAsync(READY_STABLE_MS * 2);
    expect(settled).toBe(false);

    // The last in-flight slot settles: the aggregator reports null and the
    // predicate holds. Just short of the window it is still pending...
    store.dispatch(engineLoadProgressChanged(null));
    await vi.advanceTimersByTimeAsync(READY_STABLE_MS - 1);
    expect(settled).toBe(false);

    // ...and the full undisturbed window resolves it.
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await expect(hook.ready).resolves.toBeUndefined();
  });

  it('startTour dispatches tour/start and resolves when the tour ends', async () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store, actions } = buildStore();
    installRecorderHook(store);
    const hook = getHook();
    if (!hook) throw new Error('hook not installed');

    const beats: BeatRange = { from: 1, to: 2 };
    const done = hook.startTour('demo', beats);
    let settled = false;
    void done.then(() => {
      settled = true;
    });

    // The hook dispatches through the real action creator — the payload
    // carries both the id and the beat window.
    const dispatched = actions.find((action) => action.type === startTour.type) as
      | ReturnType<typeof startTour>
      | undefined;
    expect(dispatched).toBeDefined();
    expect(dispatched?.payload).toEqual({ id: 'demo', beats: { from: 1, to: 2 } });

    // The saga's writes, driven directly: activation must not resolve it...
    store.dispatch(tourStarted({ tourId: 'demo' }));
    await Promise.resolve();
    expect(settled).toBe(false);

    // ...the tour-ended signal must.
    store.dispatch(tourEnded());
    await expect(done).resolves.toBeUndefined();
  });

  it('startTour rejects when a tour is already active', async () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store, actions } = buildStore();
    installRecorderHook(store);
    const hook = getHook();
    if (!hook) throw new Error('hook not installed');

    // Tour A is running (the saga's activation write, driven directly). A
    // takeLatest supersede never emits tourEnded for the cancelled run, so an
    // overlapping call could not attribute the eventual end — the hook is
    // single-flight and must refuse loudly instead of resolving on tour B.
    store.dispatch(tourStarted({ tourId: 'demo' }));
    const dispatchedBefore = actions.filter((action) => action.type === startTour.type).length;

    await expect(hook.startTour('webShowcase')).rejects.toThrow(
      'startTour called while a tour is already active',
    );

    // The refused call must not have dispatched a superseding tour/start.
    const dispatchedAfter = actions.filter((action) => action.type === startTour.type).length;
    expect(dispatchedAfter).toBe(dispatchedBefore);
  });

  it('startClip dispatches clip/start and resolves when the clip ends', async () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store, actions } = buildStore();
    installRecorderHook(store);
    const hook = getHook();
    if (!hook) throw new Error('hook not installed');

    const clipData: ClipData = { timeline: [] };
    const done = hook.startClip('flyout');
    let settled = false;
    void done.then(() => {
      settled = true;
    });

    // `startClip` is `createAction('clip/start', (id) => ({ payload: id }))` —
    // the payload is the bare id, not an object wrapping it.
    const dispatched = actions.find((action) => action.type === startClip.type) as
      | ReturnType<typeof startClip>
      | undefined;
    expect(dispatched).toBeDefined();
    expect(dispatched?.payload).toBe('flyout');

    // Activation must not resolve it...
    store.dispatch(clipStarted({ data: clipData, frame: DEFAULT_ORIENTATION }));
    await Promise.resolve();
    expect(settled).toBe(false);

    // ...the clip-ended signal must.
    store.dispatch(clipEnded());
    await expect(done).resolves.toBeUndefined();
  });

  it('startClip does not resolve on store updates before the clip becomes active', async () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store } = buildStore();
    installRecorderHook(store);
    const hook = getHook();
    if (!hook) throw new Error('hook not installed');

    const done = hook.startClip('flyout');
    let settled = false;
    void done.then(() => {
      settled = true;
    });

    // See `runClip`'s comment in installRecorderHook.ts for why this window exists.
    store.dispatch(engineLoadProgressChanged({ loadedBytes: 1, totalBytes: 10, inFlightCount: 1 }));
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('startClip rejects a second start before the first clip activates', async () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store, actions } = buildStore();
    installRecorderHook(store);
    const hook = getHook();
    if (!hook) throw new Error('hook not installed');

    // Clip A is dispatched but never activates — `clipStarted` is never
    // driven, mirroring the unbounded pre-activation window. A guard reading
    // `selectClipActive` would see `false` here and wave a second call
    // through; the fix is an in-flight flag set at dispatch time instead.
    const first = hook.startClip('flyout');
    void first.catch(() => {});
    const dispatchedBefore = actions.filter((action) => action.type === startClip.type).length;

    await expect(hook.startClip('earthFlyout')).rejects.toThrow(
      'startClip called while a clip is already active',
    );

    const dispatchedAfter = actions.filter((action) => action.type === startClip.type).length;
    expect(dispatchedAfter).toBe(dispatchedBefore);
  });

  it('startClip rejects when a clip is already active', async () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { store, actions } = buildStore();
    installRecorderHook(store);
    const hook = getHook();
    if (!hook) throw new Error('hook not installed');

    const clipData: ClipData = { timeline: [] };
    // Clip A is running (the player's activation write, driven directly).
    store.dispatch(clipStarted({ data: clipData, frame: DEFAULT_ORIENTATION }));
    const dispatchedBefore = actions.filter((action) => action.type === startClip.type).length;

    await expect(hook.startClip('earthFlyout')).rejects.toThrow(
      'startClip called while a clip is already active',
    );

    // The refused call must not have dispatched a superseding clip/start.
    const dispatchedAfter = actions.filter((action) => action.type === startClip.type).length;
    expect(dispatchedAfter).toBe(dispatchedBefore);
  });
});
