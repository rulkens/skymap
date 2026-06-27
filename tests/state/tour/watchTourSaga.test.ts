/**
 * watchTourSaga tests — integration tests over a real store + saga middleware.
 *
 * `watchTourSaga` is the startTour watcher: it resolves the dispatched `TourId`
 * against `tourRegistry` and launches `guidedTourSaga` with the resolved tour.
 * The registry is MOCKED here with two controlled tours — a `demo` tour whose
 * single narration beat auto-advances, and a `webShowcase` tour whose beat dwells
 * effectively forever — so each test drives timing deterministically without
 * depending on the real (catalog-resolving) tour definitions. Both tours carry a
 * `setup` effect that disables volumes, so the capture → restore round-trip is
 * OBSERVABLE in the store: each test seeds `volumes.enabled = true` first, the
 * setup flips it off during the run, and the finally winds it back on.
 *
 * Capture is a pure `select(captureScene)` and restore is `restoreSceneSaga`
 * (two `put`s), so neither watcher nor tour needs a `reconcile` stub — the
 * saga-context only carries `playClip` / `resolveDeps` / `cameraRuntime` for
 * `visitBeatSaga`.
 *
 * ### What we assert
 *
 * 1. `guidedTourSaga` ran: `tour.active` is true synchronously on startTour.
 * 2. The captured baseline is restored after natural completion (volumes back on).
 * 3. The baseline is restored when exitTour cancels a mid-dwell run.
 * 4. A second startTour supersedes a first run (takeLatest): the tour stays active
 *    under the new run and a fresh beat fly fires.
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
// forever so a run stays live until exitTour / a superseding startTour. Both
// carry a volumes-off setup so the restore is observable. Inlined in the factory
// (vi.mock is hoisted above the imports); the settings action is imported INSIDE
// the async factory because outer-scope bindings are not visible to it.
vi.mock('../../../src/data/animation/tours/tourRegistry', async () => {
  const { setVolumesEnabled } = await import('../../../src/state/settings/settingsSlice');
  const setup = { effects: [setVolumesEnabled(false)] };
  return {
    tourRegistry: {
      demo: {
        id: 'demo',
        label: 'Demo',
        setup,
        beats: [
          { clip: { start: 'live', timeline: [] }, caption: { title: 'Test' }, dwellSec: 0.001 },
        ],
      },
      webShowcase: {
        id: 'webShowcase',
        label: 'Web',
        setup,
        beats: [
          { clip: { start: 'live', timeline: [] }, caption: { title: 'Long' }, dwellSec: 9999 },
        ],
      },
    },
  };
});

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTourSaga } from '../../../src/state/tour/watchTourSaga';
import { startTour, exitTour } from '../../../src/state/tour/tourActions';
import { setVolumesEnabled } from '../../../src/state/settings/settingsSlice';
import type { FocusCameraRuntime } from '../../../src/store/types';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { ClipData } from '../../../src/@types/animation/ClipData';

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

// ─── Harness ─────────────────────────────────────────────────────────────────

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

function buildHarness(opts: { playClip?: PlayClipStub } = {}) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });

  const playClipFn: PlayClipStub =
    opts.playClip ??
    (vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined) as PlayClipStub);

  sagaMiddleware.setContext({
    resolveDeps: () => NARRATION_DEPS,
    cameraRuntime: () => CAMERA_RUNTIME,
    playClip: (clip: ClipData) => playClipFn(clip),
  });

  sagaMiddleware.run(watchTourSaga);

  return { store, sagaMiddleware, playClipFn };
}

// Fly resolves (odd calls), drift blocks forever (even calls) — lets a beat reach
// its dwell race and stay there until something interrupts it.
function makeAutoFlyStub(): PlayClipStub {
  let parity = 0;
  return vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
    parity++;
    return parity % 2 === 1 ? Promise.resolve() : new Promise<void>(() => {});
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('watchTourSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── (1) guidedTourSaga actually ran (tour marked active) ─────────────────

  it('guidedTourSaga runs: the tour is marked active on startTour', () => {
    const { store } = buildHarness();

    store.dispatch(startTour('demo'));

    // tourStarted is dispatched synchronously inside guidedTourSaga before the
    // first beat's async work begins (the App derives HUD-hidden from it).
    expect(store.getState().tour.active).toBe(true);
  });

  // ── (2) restore fires on natural completion ──────────────────────────────

  it('restores the captured baseline when all beats complete naturally', async () => {
    vi.useFakeTimers();

    const { store } = buildHarness();
    store.dispatch(setVolumesEnabled(true));

    store.dispatch(startTour('demo'));
    // Setup ran: volumes off during the tour.
    expect(store.getState().settings.volumes.enabled).toBe(false);

    // Advance timers so the 0.001s dwell expires and the beat + loop complete.
    await vi.runAllTimersAsync();

    // guidedTourSaga's finally restored the captured baseline and ended the tour.
    expect(store.getState().settings.volumes.enabled).toBe(true);
    expect(store.getState().tour.active).toBe(false);
  });

  // ── (3) restore fires when exitTour cancels the run ──────────────────────

  it('restores the captured baseline when exitTour cancels the run', async () => {
    const { store } = buildHarness({ playClip: makeAutoFlyStub() });
    store.dispatch(setVolumesEnabled(true));

    // webShowcase dwells forever — the beat never auto-advances during this test.
    store.dispatch(startTour('webShowcase'));

    // Advance to the dwell race inside the beat.
    await flush();
    await flush();
    expect(store.getState().settings.volumes.enabled).toBe(false);

    store.dispatch(exitTour());
    await flush();

    // The finally block ran on exitTour cancellation: baseline restored, tour ended.
    expect(store.getState().settings.volumes.enabled).toBe(true);
    expect(store.getState().tour.active).toBe(false);
  });

  // ── (4) second startTour supersedes first (takeLatest) ───────────────────

  it('a second startTour supersedes the first run, staying active under the new run', async () => {
    const playClip = makeAutoFlyStub();
    const { store } = buildHarness({ playClip });
    store.dispatch(setVolumesEnabled(true));

    // Start first run with a forever-dwelling tour; advance into its dwell.
    store.dispatch(startTour('webShowcase'));
    await flush();
    await flush();
    const fliesAfterFirst = playClip.mock.calls.length;

    // Dispatch a second startTour — takeLatest cancels the first worker (its
    // finally restores), then launches a fresh run that re-applies setup.
    store.dispatch(startTour('webShowcase'));
    await flush();
    await flush();

    // The second run is live and a fresh beat fly fired for it.
    expect(store.getState().tour.active).toBe(true);
    expect(playClip.mock.calls.length).toBeGreaterThan(fliesAfterFirst);
  });
});
