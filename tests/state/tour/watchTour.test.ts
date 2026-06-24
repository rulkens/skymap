/**
 * watchTour tests — integration tests over a real store + saga middleware.
 *
 * `watchTour` is the TOUR_START watcher that launches `guidedTour`. Each test
 * dispatches TOUR_START into a store running `mainSaga` (or a local saga that
 * forks `watchTour` directly) with all three saga-context stubs injected:
 *   - `playClip` — resolves immediately so beats complete without blocking
 *   - `resolveDeps` — narration-beat deps (null focus, no catalogs needed)
 *   - `cameraRuntime` — a fixed camera snapshot
 *   - `reconcile` — a `captureScene`/`restoreScene` stub
 *
 * ### What we assert
 *
 * 1. `onDone` fires when the run completes naturally (all beats done).
 * 2. `onDone` fires when TOUR_EXIT cancels the run mid-flight.
 * 3. A second TOUR_START supersedes a first run (takeLatest semantics):
 *    `onDone` for the first fires and the second run starts.
 * 4. The tour side-effects fire (setUiHidden(true) dispatched) — confirms
 *    `guidedTour` actually ran, not just that watchTour received the action.
 *
 * ### Timing
 *
 * redux-saga schedules Promise continuations as macrotasks. One `flush()`
 * (macrotask via `setTimeout(…, 0)`) advances the saga past an awaited
 * Promise continuation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTour } from '../../../src/state/tour/guidedTourSaga';
import { TOUR_START, TOUR_EXIT } from '../../../src/state/tour/tourActions';
import type { BeatData } from '../../../src/@types/tour/BeatData';
import type { FocusCameraRuntime } from '../../../src/store/types';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { SceneSnapshot } from '../../../src/@types/engine/settings/SceneSnapshot';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

// ─── Stubs ───────────────────────────────────────────────────────────────────

const CAMERA_RUNTIME: FocusCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
};

const NARRATION_DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
  structures: { byId: () => null },
};

const SENTINEL_SNAPSHOT = { settings: {}, focus: null } as unknown as SceneSnapshot;

// ─── Beat fixtures ────────────────────────────────────────────────────────────

// Narration beat: null focus exits waitUntil synchronously, no catalog needed.
const SHORT_BEAT: BeatData = { focus: null, caption: 'Test', dwellSec: 0.001 };

// ─── Harness ─────────────────────────────────────────────────────────────────

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

type ReconcileStub = {
  captureScene: ReturnType<typeof vi.fn<() => SceneSnapshot>>;
  restoreScene: ReturnType<typeof vi.fn<(s: SceneSnapshot, opts: { animate: boolean }) => void>>;
};

function buildReconcileStub(): ReconcileStub {
  return {
    captureScene: vi.fn<() => SceneSnapshot>().mockReturnValue(SENTINEL_SNAPSHOT),
    restoreScene: vi.fn<(s: SceneSnapshot, opts: { animate: boolean }) => void>(),
  };
}

function buildHarness(opts: { playClip?: PlayClipStub; reconcile?: Partial<ReconcileEffects> } = {}) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });

  const playClipFn: PlayClipStub =
    opts.playClip ??
    (vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined) as PlayClipStub);

  const reconcile = opts.reconcile ?? buildReconcileStub();

  sagaMiddleware.setContext({
    resolveDeps: () => NARRATION_DEPS,
    cameraRuntime: () => CAMERA_RUNTIME,
    playClip: (clip: ClipData) => playClipFn(clip),
    reconcile,
  });

  sagaMiddleware.run(watchTour);

  return { store, sagaMiddleware, playClipFn, reconcile };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('watchTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── (1) onDone fires on natural completion ────────────────────────────────

  it('onDone fires when all beats complete naturally', async () => {
    vi.useFakeTimers();

    const { store } = buildHarness();
    let done = false;

    store.dispatch(TOUR_START([SHORT_BEAT], () => { done = true; }));

    // Advance timers so the 0.001s dwell expires and the beat + loop complete.
    await vi.runAllTimersAsync();

    expect(done).toBe(true);
  });

  // ── (2) onDone fires when TOUR_EXIT cancels the run ───────────────────────

  it('onDone fires when TOUR_EXIT cancels the run', async () => {
    // Long dwell so the beat never auto-advances during this test.
    const longBeat: BeatData = { focus: null, caption: 'Long', dwellSec: 9999 };

    // Fly resolves immediately; drift blocks so we can interrupt mid-dwell.
    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store } = buildHarness({ playClip: playClipMock });
    let done = false;

    store.dispatch(TOUR_START([longBeat], () => { done = true; }));

    // Advance to the dwell race inside the beat.
    await flush();
    await flush();

    expect(done).toBe(false); // still running

    store.dispatch(TOUR_EXIT());
    await flush();

    expect(done).toBe(true);
  });

  // ── (3) guidedTour actually ran (setUiHidden(true) dispatched) ────────────

  it('guidedTour runs: setUiHidden(true) is dispatched on TOUR_START', async () => {
    const { store } = buildHarness();

    store.dispatch(TOUR_START([SHORT_BEAT], () => {}));

    // setUiHidden(true) is dispatched synchronously inside guidedTour before
    // the first beat's async work begins.
    expect(store.getState().ui.uiHidden).toBe(true);
  });

  // ── (4) second TOUR_START supersedes first (takeLatest) ──────────────────

  it('a second TOUR_START cancels the first run and fires its onDone', async () => {
    const longBeat: BeatData = { focus: null, caption: 'Long', dwellSec: 9999 };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx % 2 === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store } = buildHarness({ playClip: playClipMock });
    let firstDone = false;
    let secondDone = false;

    // Start first run with a long dwell.
    store.dispatch(TOUR_START([longBeat], () => { firstDone = true; }));

    // Advance to the dwell race inside the first beat.
    await flush();
    await flush();

    expect(firstDone).toBe(false);

    // Dispatch a second TOUR_START — takeLatest cancels the first worker.
    store.dispatch(TOUR_START([{ focus: null, caption: 'B2', dwellSec: 9999 }], () => { secondDone = true; }));
    await flush();

    // The first run was cancelled: its onDone must have fired.
    expect(firstDone).toBe(true);
    // The second run is live: it has not completed yet.
    expect(secondDone).toBe(false);
  });
});
