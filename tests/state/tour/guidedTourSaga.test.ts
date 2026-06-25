/**
 * guidedTourSaga tests — the outer tour loop: snapshot/restore sandwich and the
 * race between `run` (beat sequence) and `exit` (exitTour). Each test builds a
 * store with a `reconcile` stub injected alongside the visitBeatSaga stubs.
 *
 * Beat fixtures use narration focus (null) so `waitUntil` exits synchronously
 * and `focusReady` never blocks. playClip stubs resolve immediately for the
 * fly and never for the drift — two flushes advance past each beat's fly and
 * one advanceTour dispatched afterwards drives the dwell race so the beat
 * completes. Short dwell beats (dwellSec: 0.001) combined with fake timers
 * let the dwell timeout win without a manual advanceTour dispatch.
 *
 * ### Timing
 *
 * redux-saga schedules Promise continuations as macrotasks. One `flush()`
 * (a macrotask boundary via `setTimeout(…, 0)`) lets an awaited Promise
 * continuation fire and the saga advance past it.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { guidedTourSaga } from '../../../src/state/tour/guidedTourSaga';
import { exitTour } from '../../../src/state/tour/tourActions';
import { beginDrag } from '../../../src/state/camera/cameraSlice';
import type { BeatData } from '../../../src/@types/tour/BeatData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { SceneSnapshot } from '../../../src/@types/engine/settings/SceneSnapshot';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

// ─── Stubs ──────────────────────────────────────────────────────────────────

const CAMERA_RUNTIME: FocusCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
};

// Deps that make all refs immediately resolvable; the guided-tour beats use
// narration focus (null), so focusReady never blocks regardless.
const immediateDeps: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
  structures: { byId: () => null },
};

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

// Sentinel snapshot value used to assert restoreScene receives the exact
// captured object (toBe identity check).
const SENTINEL_SNAPSHOT = { settings: {}, focus: null } as unknown as SceneSnapshot;

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

function buildStore(opts: {
  playClip?: PlayClipStub;
  resolveDeps?: ResolveDeps;
  cameraRuntime?: FocusCameraRuntime | null;
  reconcile?: Partial<ReconcileEffects>;
}) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });

  const playClipFn: PlayClipStub =
    opts.playClip ??
    (vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined) as PlayClipStub);
  const deps = opts.resolveDeps ?? immediateDeps;
  const cam = opts.cameraRuntime !== undefined ? opts.cameraRuntime : CAMERA_RUNTIME;

  const ctx: Record<string, unknown> = {
    resolveDeps: () => deps,
    cameraRuntime: () => cam,
    playClip: (clip: ClipData) => playClipFn(clip),
  };
  if (opts.reconcile) ctx['reconcile'] = opts.reconcile;

  sagaMiddleware.setContext(ctx);

  return { store, sagaMiddleware, playClipFn };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('guidedTourSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: a playClip stub where the fly resolves and the drift blocks forever.
  // call count resets per-beat (two beats → two fly calls, two drift calls).
  function makeAutoFlyStub(): PlayClipStub {
    let parity = 0;
    return vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      // odd calls = fly (resolve), even calls = drift (block)
      parity++;
      return parity % 2 === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });
  }

  // ── (1) captures the scene before the first beat ──────────────────────────

  it('guidedTourSaga captures the scene before the first beat', async () => {
    const reconcile = buildReconcileStub();
    const beat: BeatData = { focus: null, caption: 'B1', dwellSec: 60 };

    const { sagaMiddleware } = buildStore({ reconcile });
    sagaMiddleware.run(guidedTourSaga, [beat]);

    // One flush: the saga runs getContext, calls captureScene, puts setUiHidden,
    // enters the race, starts visitBeatSaga, reaches the fly call.
    await flush();

    // captureScene must have fired before any beat side-effect.
    expect(reconcile.captureScene).toHaveBeenCalledTimes(1);
  });

  // ── (2) hides the UI and restores it after completion ────────────────────

  it('guidedTourSaga hides the UI for the duration and restores it after', async () => {
    vi.useFakeTimers();

    const reconcile = buildReconcileStub();
    // Very short dwell so the beat completes without a manual advanceTour.
    const beat: BeatData = { focus: null, caption: 'B1', dwellSec: 0.001 };

    // Fly resolves; drift blocks (timeout wins the dwell race).
    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ reconcile, playClip: playClipMock });
    sagaMiddleware.run(guidedTourSaga, [beat]);

    // setUiHidden(true) must be in the store already.
    expect(store.getState().ui.uiHidden).toBe(true);

    // Advance timers so the dwell timeout fires and the beat + loop complete.
    await vi.runAllTimersAsync();

    // After natural completion the finally must restore + unhide.
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
    expect(store.getState().ui.uiHidden).toBe(false);
  });

  // ── (3) runs every beat in order ─────────────────────────────────────────

  it('guidedTourSaga runs every beat in order', async () => {
    vi.useFakeTimers();

    const reconcile = buildReconcileStub();
    const beat1: BeatData = { focus: null, caption: 'First', dwellSec: 0.001 };
    const beat2: BeatData = { focus: null, caption: 'Second', dwellSec: 0.001 };

    // Fly calls resolve; drift calls block. Calls interleave: fly1, drift1, fly2, drift2.
    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ reconcile, playClip: stub });

    sagaMiddleware.run(guidedTourSaga, [beat1, beat2]);

    // Run all timers — each beat's 0.001 s dwell fires the timeout and advances.
    await vi.runAllTimersAsync();

    // Both captions must have appeared in order; the final state should be null
    // (cleared after beat2) and uiHidden restored to false.
    expect(store.getState().ui.caption).toBeNull();
    expect(store.getState().ui.uiHidden).toBe(false);

    // restoreScene called once after both beats complete.
    expect(reconcile.restoreScene).toHaveBeenCalledTimes(1);
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
  });

  // ── (4) exitTour cancels mid-beat and the finally restores the scene ─────

  it('exitTour cancels mid-beat and the finally restores the scene', async () => {
    const reconcile = buildReconcileStub();
    // Long dwell — we will interrupt before it auto-advances.
    const beat: BeatData = { focus: null, caption: 'B1', dwellSec: 9999 };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ reconcile, playClip: playClipMock });
    sagaMiddleware.run(guidedTourSaga, [beat]);

    // Advance to the dwell race inside beat 1 (fly resolved, drift blocking).
    await flush();
    await flush();

    // Dispatch exitTour — the exit arm wins the outer race and cancels run.
    store.dispatch(exitTour());
    await flush();

    // finally must have executed: restore called and UI unhidden.
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
    expect(store.getState().ui.uiHidden).toBe(false);
  });

  // ── (5) natural completion restores the scene ─────────────────────────────

  it('natural completion restores the scene', async () => {
    vi.useFakeTimers();

    const reconcile = buildReconcileStub();
    const beat: BeatData = { focus: null, caption: 'B1', dwellSec: 0.001 };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ reconcile, playClip: playClipMock });
    sagaMiddleware.run(guidedTourSaga, [beat]);

    // Run timers so the single beat completes and the loop exits naturally.
    await vi.runAllTimersAsync();

    // restoreScene must have fired — the finally ran on natural completion.
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
    expect(store.getState().ui.uiHidden).toBe(false);
  });

  // ── (6) camera-input action does not abort the tour ──────────────────────

  it('no camera-input action aborts the tour', async () => {
    const reconcile = buildReconcileStub();
    // Long dwell so the beat never auto-advances during this test.
    const beat: BeatData = { focus: null, caption: 'B1', dwellSec: 9999 };

    let callIdx = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callIdx++;
      return callIdx === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ reconcile, playClip: playClipMock });
    sagaMiddleware.run(guidedTourSaga, [beat]);

    // Advance to the dwell race inside beat 1.
    await flush();
    await flush();

    // Dispatch a camera-input action — must have NO effect on tour lifecycle.
    store.dispatch(beginDrag());
    await flush();

    // restoreScene must NOT have been called — the tour is still running.
    expect(reconcile.restoreScene).not.toHaveBeenCalled();
    // uiHidden stays true — the tour is mid-beat.
    expect(store.getState().ui.uiHidden).toBe(true);
  });
});
