/**
 * watchTourSaga tests — integration tests over a real store + saga middleware.
 *
 * `watchTourSaga` is the startTour watcher: it resolves the dispatched `TourId`
 * against `tourRegistry` and launches `guidedTourSaga` with the resolved tour's
 * beats. The registry is MOCKED here with two controlled tours — a `demo` tour
 * whose single narration beat auto-advances, and a `webShowcase` tour whose beat
 * dwells effectively forever — so each test drives timing deterministically
 * without depending on the real (catalog-resolving) tour definitions. Each test
 * dispatches `startTour(id)` into a store running `watchTourSaga` directly with
 * all saga-context stubs injected:
 *   - `playClip` — resolves immediately so beats complete without blocking
 *   - `resolveDeps` — narration-beat deps (null focus, no catalogs needed)
 *   - `cameraRuntime` — a fixed camera snapshot
 *   - `reconcile` — a `captureScene`/`restoreScene` stub
 *
 * ### What we assert
 *
 * 1. `guidedTourSaga` actually ran: `setUiHidden(true)` is dispatched synchronously
 *    on startTour, confirming the saga body executed (not just that the action
 *    was received).
 * 2. `captureScene` is called and `restoreScene` fires after natural completion,
 *    confirming the snapshot/restore pair in `guidedTourSaga`'s try/finally executed.
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

// Controlled registry: `demo` auto-advances (tiny dwell), `webShowcase` dwells
// forever so a run stays live until exitTour / a superseding startTour. Inlined
// in the factory (vi.mock is hoisted above the imports).
// Both use narration clips (empty timeline) so clipFociReady exits immediately.
// The clip literals are inlined inside the factory because vi.mock factories are
// hoisted before the module scope runs, so outer-scope constants are not visible.
vi.mock('../../../src/data/animation/tours/tourRegistry', () => ({
  tourRegistry: {
    demo: {
      id: 'demo',
      label: 'Demo',
      beats: [
        { clip: { start: 'live', timeline: [] }, caption: { title: 'Test' }, dwellSec: 0.001 },
      ],
    },
    webShowcase: {
      id: 'webShowcase',
      label: 'Web',
      beats: [
        { clip: { start: 'live', timeline: [] }, caption: { title: 'Long' }, dwellSec: 9999 },
      ],
    },
  },
}));

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTourSaga } from '../../../src/state/tour/watchTourSaga';
import { startTour, exitTour } from '../../../src/state/tour/tourActions';
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

  sagaMiddleware.run(watchTourSaga);

  return { store, sagaMiddleware, playClipFn, reconcile };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('watchTourSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── (1) guidedTourSaga actually ran (tourStarted dispatched) ────────────

  it('guidedTourSaga runs: the tour is marked active on startTour', async () => {
    const { store } = buildHarness();

    store.dispatch(startTour('demo'));

    // tourStarted is dispatched synchronously inside guidedTourSaga before the
    // first beat's async work begins (the App derives HUD-hidden from it).
    expect(store.getState().tour.active).toBe(true);
  });

  // ── (2) restoreScene fires on natural completion ──────────────────────────

  it('restoreScene fires when all beats complete naturally', async () => {
    vi.useFakeTimers();

    const reconcile = buildReconcileStub();
    const { store } = buildHarness({ reconcile });

    store.dispatch(startTour('demo'));

    // Advance timers so the 0.001s dwell expires and the beat + loop complete.
    await vi.runAllTimersAsync();

    // guidedTourSaga's finally must have run: captureScene called before the beat,
    // restoreScene called after completion.
    expect(reconcile.captureScene).toHaveBeenCalledTimes(1);
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
  });

  // ── (3) restoreScene fires when exitTour cancels the run ────────────────

  it('restoreScene fires when exitTour cancels the run', async () => {
    // Fly resolves immediately; drift blocks so we can interrupt mid-dwell.
    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const reconcile = buildReconcileStub();
    const { store } = buildHarness({ playClip: playClipMock, reconcile });

    // webShowcase dwells forever — the beat never auto-advances during this test.
    store.dispatch(startTour('webShowcase'));

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
    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx % 2 === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const reconcile = buildReconcileStub();
    const { store } = buildHarness({ playClip: playClipMock, reconcile });

    // Start first run with a forever-dwelling tour.
    store.dispatch(startTour('webShowcase'));

    // Advance to the dwell race inside the first beat.
    await flush();
    await flush();

    // First run is live — restoreScene has not fired yet.
    expect(reconcile.restoreScene).not.toHaveBeenCalled();

    // Dispatch a second startTour — takeLatest cancels the first worker.
    store.dispatch(startTour('webShowcase'));
    await flush();

    // The first run was cancelled: its finally block must have run.
    expect(reconcile.restoreScene).toHaveBeenCalledTimes(1);
    // The second run is live: the tour is still marked active.
    expect(store.getState().tour.active).toBe(true);
  });
});
