/**
 * visitBeatSaga tests — integration tests over a real store + saga middleware,
 * following the reconcile saga harness pattern.
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
import { visitBeatSaga } from '../../../src/state/tour/visitBeatSaga';
import { advanceTour } from '../../../src/state/tour/tourActions';
import { setFlow } from '../../../src/state/settings/settingsSlice';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

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

function buildStore(opts: {
  playClip?: PlayClipStub;
  resolveDeps?: ResolveDeps;
  cameraRuntime?: FocusCameraRuntime | null;
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

  sagaMiddleware.setContext({
    resolveDeps: () => deps,
    cameraRuntime: () => cam,
    playClip: (clip: ClipData) => playClipFn(clip),
  });

  return { store, sagaMiddleware, playClipFn };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('visitBeatSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (1) waits for focus data before flying ────────────────────────────────

  it('visitBeatSaga waits for focus data before flying', async () => {
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

    sagaMiddleware.run(visitBeatSaga, galaxyBeat);

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

  it('visitBeatSaga awaits the fly clip before arming advance', async () => {
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

    sagaMiddleware.run(visitBeatSaga, milkyWayBeat);

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

  it('visitBeatSaga puts each effect verbatim (no wrapper)', async () => {
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

    sagaMiddleware.run(visitBeatSaga, beatWithEffect);

    await flush();
    await flush();

    // The setFlow effect must have been dispatched verbatim.
    expect(store.getState().settings.flow.enabled).toBe(true);
  });

  // ── (4) puts showCaption then clears it ───────────────────────────────────

  it('visitBeatSaga puts showCaption then clears it', async () => {
    // Fly resolves; drift blocks so advanceTour drives the race.
    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount++;
      return callCount <= 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeatSaga, narrationBeat);

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

    sagaMiddleware.run(visitBeatSaga, milkyWayBeat);

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

    sagaMiddleware.run(visitBeatSaga, shortDwellBeat);

    // Advance past the fly (already resolved) + past the 2s dwell timer.
    await vi.runAllTimersAsync();

    expect(store.getState().ui.caption).toBeNull();
  });
});
