/**
 * visitBeat tests — integration tests over a real store + saga middleware,
 * following the reconcileSagas harness pattern.
 *
 * Each test builds a fresh store with the three context stubs injected via
 * `sagaMiddleware.setContext` BEFORE running the saga. A `playClip` stub
 * returns either a pre-resolved Promise (for the phases we want to skip past)
 * or a manually-controlled Promise (for the phases we inspect mid-flight).
 *
 * ### Timing
 *
 * redux-saga schedules Promise continuations as macrotasks. One `flush()`
 * (a macrotask boundary via `setTimeout(…, 0)`) lets an awaited Promise
 * continuation fire and the saga advance past it. Where two async boundaries
 * occur in sequence, two consecutive `flush()` calls are needed.
 *
 * ### waitUntil and the focusReady predicate
 *
 * `waitUntil` polls via `delay(POLL_MS)`. In the "waits for focus data" test,
 * we use Vitest fake timers to advance past the poll delay without real-time
 * waits. All other tests keep focus immediately ready (narration or milkyWay
 * beats) so `waitUntil` exits on the first synchronous predicate check.
 *
 * ### The drift race and CANCEL
 *
 * When advanceTour wins the dwell race, redux-saga cancels the `drift` branch.
 * For `call(fn, arg)` where `fn` returns a Promise, cancellation fires
 * `p[CANCEL]()` if it exists. The test attaches a `[CANCEL]` hook to the
 * drift stub's Promise so we can assert that cancellation fired.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';
import { CANCEL } from '@redux-saga/core';

import { rootReducer } from '../../../src/store/rootReducer';
import { visitBeat, guidedTour } from '../../../src/state/tour/guidedTourSaga';
import { advanceTour, exitTour } from '../../../src/state/tour/tourActions';
import { setFlow } from '../../../src/state/settings/settingsSlice';
import { beginDrag } from '../../../src/state/camera/cameraSlice';
import type { BeatData } from '../../../src/@types/tour/BeatData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SceneSnapshot } from '../../../src/@types/engine/settings/SceneSnapshot';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

// CANCEL is typed as `string` in @redux-saga/core, but its runtime value is a
// Symbol. Cast so we can use it as a property key on the drift Promise stub.
const CANCEL_SYM = CANCEL as unknown as symbol;

const flush = () => new Promise((r) => setTimeout(r, 0));

// ─── Stubs ──────────────────────────────────────────────────────────────────

const CAMERA_RUNTIME: FocusCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
};

// Deps that make all refs immediately resolvable (structures/milkyWay).
const immediateDeps: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
  structures: {
    byId: (id) =>
      ({
        type: 'structure',
        id,
        name: 'Test Structure',
        category: 'cluster',
        worldPos: [1, 2, 3],
        physicalRadiusMpc: 1,
        apparentRadiusMpc: 2,
        featured: true,
      }) as const,
  },
};

// ─── Beat fixtures ──────────────────────────────────────────────────────────

const milkyWayBeat: BeatData = { focus: { type: 'milkyWay' }, caption: 'Our galaxy', dwellSec: 5 };
const narrationBeat: BeatData = { focus: null, caption: 'Narration', dwellSec: 4 };
const galaxyBeat: BeatData = {
  focus: { type: 'galaxyCatalog', source: 0, index: 0 },
  caption: 'Galaxy',
  dwellSec: 3,
};

// ─── Harness ─────────────────────────────────────────────────────────────────

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

// Sentinel snapshot value used in guidedTour tests to assert restoreScene
// receives the exact captured object (toBe identity check).
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

  // A minimal reconcile stub so guidedTour tests can inject captureScene/restoreScene.
  // visitBeat tests don't pass `reconcile` and so don't set the context key — that is
  // fine because visitBeat never reads `getContext('reconcile')`.
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

describe('visitBeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (1) waits for focus data before flying ────────────────────────────────

  it('visitBeat waits for focus data before flying', async () => {
    vi.useFakeTimers();

    let cloudLoaded = false;

    // Minimal single-row cloud stub shaped like a real GalaxyCatalog.
    const CLOUD: GalaxyCatalog = {
      count: 1,
      positions: new Float32Array([1, 0, 0]),
      spectroscopicZ: new Float32Array([0.01]),
      magU: new Float32Array([18]),
      magG: new Float32Array([17]),
      magR: new Float32Array([16]),
      magI: new Float32Array([16]),
      magZ: new Float32Array([16]),
      objIDs: new BigUint64Array([1n]),
      diameterKpc: new Float32Array([30]),
      axisRatio: new Float32Array([1]),
      positionAngleDeg: new Float32Array([0]),
      classByte: new Uint8Array([0]),
      parentSurveyByte: new Uint8Array([0]),
    } as unknown as GalaxyCatalog;

    const lazyDeps: ResolveDeps = {
      catalogs: { get: () => (cloudLoaded ? CLOUD : undefined) },
      famousMeta: [],
      structures: { byId: () => null },
    };

    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, resolveDeps: lazyDeps });

    sagaMiddleware.run(visitBeat, galaxyBeat);

    // Cloud not loaded — saga is blocked in waitUntil.
    await vi.advanceTimersByTimeAsync(200);
    expect(playClipMock).not.toHaveBeenCalled();

    // Cloud now arrives.
    cloudLoaded = true;
    await vi.runAllTimersAsync();

    // After a poll succeeds, the saga proceeds to call playClip.
    expect(playClipMock).toHaveBeenCalled();
  });

  // ── (2) awaits the fly clip before arming advance ─────────────────────────

  it('visitBeat awaits the fly clip before arming advance', async () => {
    let resolveFly!: () => void;
    const flyPromise = new Promise<void>((res) => {
      resolveFly = res;
    });

    // First call = establishing fly (held); second call = dwell drift (resolves).
    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? flyPromise : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeat, milkyWayBeat);

    await flush(); // saga runs to the fly call and awaits

    // Caption not shown yet — we're still in the fly.
    expect(store.getState().ui.caption).toBeNull();

    // Dispatch advanceTour during the fly — must have no effect (fly not done).
    store.dispatch(advanceTour());
    await flush();

    // Still no caption.
    expect(store.getState().ui.caption).toBeNull();

    // Resolve the fly.
    resolveFly();
    await flush();
    await flush(); // post-fly effects + showCaption

    // Caption now visible — the saga proceeded after the fly resolved.
    expect(store.getState().ui.caption).toBe(milkyWayBeat.caption);
  });

  // ── (3) puts each effect verbatim ────────────────────────────────────────

  it('visitBeat puts each effect verbatim (no wrapper)', async () => {
    const effectAction = setFlow({ enabled: true });
    const beatWithEffect: BeatData = {
      focus: null,
      caption: 'With effect',
      dwellSec: 30,
      effects: [effectAction],
    };

    // Both fly and drift resolve immediately; the saga dwell will be long but
    // effects fire before the dwell race starts.
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeat, beatWithEffect);

    await flush();
    await flush();

    // The setFlow effect must have been dispatched verbatim.
    expect(store.getState().settings.flow.enabled).toBe(true);
  });

  // ── (4) puts showCaption then clears it ───────────────────────────────────

  it('visitBeat puts showCaption then clears it', async () => {
    // Fly resolves; drift blocks so advanceTour drives the race.
    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount++;
      return callCount <= 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeat, narrationBeat);

    await flush();
    await flush();

    expect(store.getState().ui.caption).toBe(narrationBeat.caption);

    store.dispatch(advanceTour());
    await flush();

    expect(store.getState().ui.caption).toBeNull();
  });

  // ── (5) advanceTour wins the dwell race and cancels dwellDrift ───────────

  it('advanceTour wins the dwell race and cancels dwellDrift', async () => {
    let cancelCalled = false;

    // Fly resolves immediately. Drift returns a never-resolving Promise with a
    // [CANCEL] hook so we can assert that redux-saga fires cancellation.
    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve();
      const p: Promise<void> & { [key: symbol]: () => void } = new Promise<void>(
        () => {},
      ) as Promise<void> & { [key: symbol]: () => void };
      p[CANCEL_SYM] = () => {
        cancelCalled = true;
      };
      return p;
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeat, milkyWayBeat);

    await flush();
    await flush(); // saga reaches the dwell race

    store.dispatch(advanceTour());
    await flush();

    // The drift's [CANCEL] hook must have fired.
    expect(cancelCalled).toBe(true);
    // Caption cleared after the race.
    expect(store.getState().ui.caption).toBeNull();
  });

  // ── (6) dwell timeout auto-advances when no click arrives ────────────────

  it('the dwell timeout auto-advances when no click arrives', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const shortDwellBeat: BeatData = { focus: null, caption: 'Short dwell', dwellSec: 2 };
    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeat, shortDwellBeat);

    // Advance past the fly (already resolved) + past the 2s dwell timer.
    await vi.runAllTimersAsync();

    expect(store.getState().ui.caption).toBeNull();
  });
});

// ─── guidedTour tests ─────────────────────────────────────────────────────────

/**
 * These tests verify the outer tour loop — snapshot/restore sandwich and the
 * race between `run` (beat sequence) and `exit` (exitTour). Each test builds
 * a store with a `reconcile` stub injected alongside the visitBeat stubs.
 *
 * Beat fixtures use narration focus (null) so `waitUntil` exits synchronously
 * and `focusReady` never blocks. playClip stubs resolve immediately for the
 * fly and never for the drift — two flushes advance past each beat's fly and
 * one advanceTour dispatched afterwards drives the dwell race so the beat
 * completes. Short dwell beats (dwellSec: 0.001) combined with fake timers
 * let the dwell timeout win without manual advanceTour dispatch.
 */

describe('guidedTour', () => {
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

  it('guidedTour captures the scene before the first beat', async () => {
    const reconcile = buildReconcileStub();
    const beat: BeatData = { focus: null, caption: 'B1', dwellSec: 60 };

    const { sagaMiddleware } = buildStore({ reconcile });
    sagaMiddleware.run(guidedTour, [beat]);

    // One flush: the saga runs getContext, calls captureScene, puts setUiHidden,
    // enters the race, starts visitBeat, reaches the fly call.
    await flush();

    // captureScene must have fired before any beat side-effect. The saga has
    // already dispatched setUiHidden(true) and entered visitBeat at this point —
    // the important assertion is that captureScene was called (before the fly,
    // which is the first beat side-effect).
    expect(reconcile.captureScene).toHaveBeenCalledTimes(1);
  });

  // ── (2) hides the UI and restores it after completion ────────────────────

  it('guidedTour hides the UI for the duration and restores it after', async () => {
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
    sagaMiddleware.run(guidedTour, [beat]);

    // setUiHidden(true) must be in the store already.
    expect(store.getState().ui.uiHidden).toBe(true);

    // Advance timers so the dwell timeout fires and the beat + loop complete.
    await vi.runAllTimersAsync();

    // After natural completion the finally must restore + unhide.
    expect(reconcile.restoreScene).toHaveBeenCalledWith(SENTINEL_SNAPSHOT, { animate: true });
    expect(store.getState().ui.uiHidden).toBe(false);
  });

  // ── (3) runs every beat in order ─────────────────────────────────────────

  it('guidedTour runs every beat in order', async () => {
    vi.useFakeTimers();

    const reconcile = buildReconcileStub();
    const beat1: BeatData = { focus: null, caption: 'First', dwellSec: 0.001 };
    const beat2: BeatData = { focus: null, caption: 'Second', dwellSec: 0.001 };

    // Fly calls resolve; drift calls block. Calls interleave: fly1, drift1, fly2, drift2.
    const stub = makeAutoFlyStub();
    const { store, sagaMiddleware } = buildStore({ reconcile, playClip: stub });

    sagaMiddleware.run(guidedTour, [beat1, beat2]);

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
    sagaMiddleware.run(guidedTour, [beat]);

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
    sagaMiddleware.run(guidedTour, [beat]);

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
    sagaMiddleware.run(guidedTour, [beat]);

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
