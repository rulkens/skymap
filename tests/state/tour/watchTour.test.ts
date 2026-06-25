/**
 * watchTour tests — integration tests over a real store + saga middleware.
 *
 * `watchTour` is the startTour watcher that launches `guidedTour`. Each test
 * dispatches startTour into a store running `watchTour` directly with all
 * saga-context stubs injected:
 *   - `playClip` — resolves immediately so beats complete without blocking
 *   - `resolveDeps` — narration-beat deps (null focus, no catalogs needed)
 *   - `cameraRuntime` — a fixed camera snapshot
 *   - `reconcile` — a `captureScene`/`restoreScene` stub
 *
 * ### What we assert
 *
 * 1. `guidedTour` actually ran: `setUiHidden(true)` is dispatched synchronously
 *    on startTour, confirming the saga body executed (not just that the action
 *    was received).
 * 2. `captureScene` is called and `restoreScene` fires after natural completion,
 *    confirming the snapshot/restore pair in `guidedTour`'s try/finally executed.
 * 3. `restoreScene` fires when exitTour cancels a mid-dwell run — the finally
 *    block runs on BOTH paths.
 * 4. A second startTour supersedes a first run (takeLatest semantics): the
 *    first run's `restoreScene` fires before the second run's beats execute.
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
import { startTour, exitTour } from '../../../src/state/tour/tourActions';
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

function buildHarness(
  opts: { playClip?: PlayClipStub; reconcile?: Partial<ReconcileEffects> } = {},
) {
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

  // ── (1) guidedTour actually ran (setUiHidden(true) dispatched) ────────────

  it('guidedTour runs: setUiHidden(true) is dispatched on startTour', async () => {
    const { store } = buildHarness();

    store.dispatch(startTour([SHORT_BEAT]));

    // setUiHidden(true) is dispatched synchronously inside guidedTour before
    // the first beat's async work begins.
    expect(store.getState().ui.uiHidden).toBe(true);
  });

  // ── (2) restoreScene fires on natural completion ──────────────────────────

  it('restoreScene fires when all beats complete naturally', async () => {
    vi.useFakeTimers();

    const reconcile = buildReconcileStub();
    const { store } = buildHarness({ reconcile });

    store.dispatch(startTour([SHORT_BEAT]));

    // Advance timers so the 0.001s dwell expires and the beat + loop complete.
    await vi.runAllTimersAsync();

    // guidedTour's finally must have run: captureScene called before the beat,
    // restoreScene called after completion.
    expect(reconcile.captureScene).toHaveBeenCalledTimes(1);
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
  });

  // ── (3) restoreScene fires when exitTour cancels the run ────────────────

  it('restoreScene fires when exitTour cancels the run', async () => {
    // Long dwell so the beat never auto-advances during this test.
    const longBeat: BeatData = { focus: null, caption: 'Long', dwellSec: 9999 };

    // Fly resolves immediately; drift blocks so we can interrupt mid-dwell.
    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const reconcile = buildReconcileStub();
    const { store } = buildHarness({ playClip: playClipMock, reconcile });

    store.dispatch(startTour([longBeat]));

    // Advance to the dwell race inside the beat.
    await flush();
    await flush();

    // Still running — restoreScene has not fired yet.
    expect(reconcile.restoreScene).not.toHaveBeenCalled();

    store.dispatch(exitTour());
    await flush();

    // The finally block must have run on exitTour cancellation.
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
  });

  // ── (4) second startTour supersedes first (takeLatest) ──────────────────

  it('a second startTour cancels the first run', async () => {
    const longBeat: BeatData = { focus: null, caption: 'Long', dwellSec: 9999 };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx % 2 === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const reconcile = buildReconcileStub();
    const { store } = buildHarness({ playClip: playClipMock, reconcile });

    // Start first run with a long dwell.
    store.dispatch(startTour([longBeat]));

    // Advance to the dwell race inside the first beat.
    await flush();
    await flush();

    // First run is live — restoreScene has not fired yet.
    expect(reconcile.restoreScene).not.toHaveBeenCalled();

    // Dispatch a second startTour — takeLatest cancels the first worker.
    store.dispatch(startTour([{ focus: null, caption: 'B2', dwellSec: 9999 }]));
    await flush();

    // The first run was cancelled: its finally block must have run.
    expect(reconcile.restoreScene).toHaveBeenCalledTimes(1);
    // The second run is live: setUiHidden(true) is still in effect.
    expect(store.getState().ui.uiHidden).toBe(true);
  });
});
