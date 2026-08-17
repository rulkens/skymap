/**
 * visitBeatSaga tests — integration tests over a real store + saga middleware,
 * following the reconcile saga harness pattern.
 *
 * Each test builds a fresh store with the three context stubs injected via
 * `sagaMiddleware.setContext` BEFORE running the saga. A `playClip` stub
 * returns either a pre-resolved Promise (for the phases we want to skip past)
 * or a manually-controlled Promise (for the phases we inspect mid-flight).
 *
 * ### What the saga makes observable
 *
 * The caption text is no longer stored — it is derived from the registry — so
 * these tests observe the saga through the `tour` slice it writes and its
 * return value:
 *   - `beatChanged(index)` sets `tour.beatIndex` at the start (fly start).
 *   - `dwellStarted()` bumps `tour.dwellNonce` ONLY after the fly lands.
 *   - `setPaused(bool)` toggles `tour.paused` around a pause.
 *   - the saga RETURNS `'next'` (advance / timeout) or `'prev'` (step back);
 *     `sagaMiddleware.run(...).toPromise()` resolves with it.
 *
 * ### Timing
 *
 * redux-saga schedules Promise continuations as macrotasks. One `flush()`
 * (a macrotask boundary) lets an awaited Promise continuation fire and the saga
 * advance past it. Two sequential async boundaries need two `flush()` calls.
 *
 * ### The drift race and CANCEL
 *
 * When advanceTour wins the dwell race, redux-saga cancels the `drift` branch.
 * For `call(fn, arg)` where `fn` returns a Promise, cancellation fires
 * `p[CANCEL]()` if it exists. The test attaches a `[CANCEL]` hook to the drift
 * stub's Promise so we can assert that cancellation fired.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';
import { CANCEL } from '@redux-saga/core';

import { rootReducer } from '../../../src/store/rootReducer';
import { visitBeatSaga } from '../../../src/state/tour/visitBeatSaga';
import { advanceTour, prevBeat, togglePause } from '../../../src/state/tour/tourActions';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import { flyAndFocusOnClip } from '../../../src/state/tour/flyAndFocusOnClip';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import { focusId } from '../../../src/utils/animation/focusId';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';

// CANCEL is typed as `string` in @redux-saga/core, but its runtime value is a
// Symbol. Cast so we can use it as a property key on the drift Promise stub.
const CANCEL_SYM = CANCEL as unknown as symbol;

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * collectTimelineNodes — recursively walks a clip's timeline tree and collects
 * all Effect nodes (seq/all/fork/leaf). Traverses seq.children, all.children,
 * and fork.child depth-first, calling mapFn for each node.
 */
function collectTimelineNodes<T>(
  effects: ClipData['timeline'],
  mapFn: (effect: (typeof effects)[0]) => T,
): T[] {
  const results: T[] = [];
  for (const e of effects) {
    results.push(mapFn(e));
    if (e.kind === 'seq' || e.kind === 'all')
      results.push(...collectTimelineNodes(e.children, mapFn));
    else if (e.kind === 'fork') results.push(...collectTimelineNodes([e.child], mapFn));
  }
  return results;
}

// ─── Stubs ───────────────────────────────────────────────────────────────────

const CAMERA_RUNTIME: LiveCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
  upBasisQuat: [0, 0, 0, 1],
};

// Structure resolved by id immediately — no catalog needed.
const STRUCTURE_DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  stars: { current: () => null },
  structures: {
    byId: (id) =>
      ({
        type: 'structure',
        id,
        name: 'Test Structure',
        category: 'cluster',
        worldPos: [1, 2, 3] as [number, number, number],
        physicalRadiusMpc: 1,
        apparentRadiusMpc: 2,
        featured: true,
      }) as const,
  },
};

// ─── Beat fixtures ───────────────────────────────────────────────────────────

// A clip with a milkyWay focus id — resolves immediately without catalog data.
const milkyWayClip: ClipData = flyAndFocusOnClip(focusId('milkyWay'));
const milkyWayBeat: BeatData = {
  enterClip: milkyWayClip,
  caption: { title: 'Our galaxy' },
  dwellClip: dwellDrift(5),
};

// A clip with no focus ids — trivially ready. Used for the silent
// (null-caption) short-dwell beat in the timeout test.
const narrationClip: ClipData = { start: 'live', timeline: [] };

// A clip with a structure focus id — resolves immediately (structures are always in deps).
const structureClip: ClipData = flyAndFocusOnClip(focusId('cluster-virgo'));
const structureBeat: BeatData = {
  enterClip: structureClip,
  caption: { title: 'Virgo Cluster' },
  dwellClip: dwellDrift(3),
};

// ─── Harness ────────────────────────────────────────────────────────────────

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

function buildStore(opts: {
  playClip?: PlayClipStub;
  resolveDeps?: ResolveDeps;
  cameraRuntime?: LiveCameraRuntime | null;
}) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });

  const playClipFn: PlayClipStub =
    opts.playClip ??
    (vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined) as PlayClipStub);
  const deps = opts.resolveDeps ?? STRUCTURE_DEPS;
  const cam = opts.cameraRuntime !== undefined ? opts.cameraRuntime : CAMERA_RUNTIME;

  sagaMiddleware.setContext({
    resolveDeps: () => deps,
    cameraRuntime: () => cam,
    playClip: (clip: ClipData) => playClipFn(clip),
  });

  return { store, sagaMiddleware, playClipFn };
}

// A playClip stub: first call (the fly) resolves per `flyResolves`; every later
// call (the dwell drift) never resolves, so it always loses the dwell race.
function flyThenBlockingDrift(flyResolves: boolean): PlayClipStub {
  let n = 0;
  return vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
    n += 1;
    if (n > 1) return new Promise<void>(() => {});
    return flyResolves ? Promise.resolve() : new Promise<void>(() => {});
  }) as PlayClipStub;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('visitBeatSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (1) waits until clip foci are ready AND camera runtime is non-null ────

  it('waits until clip foci are ready and camera runtime is non-null before playing', async () => {
    vi.useFakeTimers();

    let cloudLoaded = false;

    const FAMOUS_ID = 'm87';
    const CLOUD: GalaxyCatalog = makeGalaxyCatalog(1, {
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
    });

    const lazyDeps: ResolveDeps = {
      catalogs: { get: () => (cloudLoaded ? CLOUD : undefined) },
      famousGalaxiesMeta: [{ id: FAMOUS_ID, name: 'M87', pgc: 41361 } as never],
      structures: { byId: () => null },
      stars: { current: () => null },
    };

    const famousBeat: BeatData = {
      enterClip: flyAndFocusOnClip(focusId(FAMOUS_ID)),
      caption: { title: 'M87' },
      dwellClip: dwellDrift(3),
    };

    const playClipMock = flyThenBlockingDrift(true);
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, resolveDeps: lazyDeps });

    // Camera runtime is dynamic; override the context with a closure read.
    let currentRuntime: LiveCameraRuntime | null = null;
    sagaMiddleware.setContext({
      resolveDeps: () => lazyDeps,
      cameraRuntime: () => currentRuntime,
      playClip: (clip: ClipData) => playClipMock(clip),
    });

    sagaMiddleware.run(visitBeatSaga, famousBeat, 0);

    // Cloud not loaded, runtime null — saga blocked in waitUntil.
    await vi.advanceTimersByTimeAsync(200);
    expect(playClipMock).not.toHaveBeenCalled();

    // Cloud arrives but runtime still null.
    cloudLoaded = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(playClipMock).not.toHaveBeenCalled();

    // Runtime arrives — both conditions satisfied, saga proceeds to playClip.
    currentRuntime = CAMERA_RUNTIME;
    await vi.advanceTimersByTimeAsync(200);
    expect(playClipMock).toHaveBeenCalled();
  });

  // ── (2) passes the fully-resolved clip to playClip ────────────────────────

  it('passes the resolved clip to playClip — no id-bearing cues remain', async () => {
    const playClipMock = flyThenBlockingDrift(true);
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, resolveDeps: STRUCTURE_DEPS });

    sagaMiddleware.run(visitBeatSaga, structureBeat, 0);

    await flush();
    await flush();

    expect(playClipMock).toHaveBeenCalled();
    const resolvedClip = playClipMock.mock.calls[0]![0];

    const kinds = collectTimelineNodes(resolvedClip.timeline, (e) => e.kind);
    expect(kinds).not.toContain('moveTargetId');
    expect(kinds).not.toContain('dollyToId');
    expect(kinds).not.toContain('focusId');
    expect(kinds).toContain('setVec'); // resolved moveTargetId → setVec
    expect(kinds).toContain('set'); // resolved dollyToId → set
    expect(kinds).toContain('focus'); // resolved focusId → focus
  });

  // ── (3) the dwell does not start until the fly lands ──────────────────────

  it('sets the beat index immediately but does not start the dwell until the fly lands', async () => {
    let resolveFly!: () => void;
    const flyPromise = new Promise<void>((res) => {
      resolveFly = res;
    });

    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? flyPromise : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 2);

    await flush(); // saga runs to the clip call and awaits

    // beatChanged fired: index set. dwellStarted has NOT: ring stays at 0.
    expect(store.getState().tour.beatIndex).toBe(2);
    expect(store.getState().tour.dwellNonce).toBe(0);

    // Land the fly — the dwell now begins and the nonce bumps.
    resolveFly();
    await flush();
    await flush();
    expect(store.getState().tour.dwellNonce).toBe(1);
  });

  // ── (3b) navigation during the FLY skips it — the enter clip is not a lock ──

  it("returns 'next' when advanceTour arrives mid-fly, cancelling the fly and skipping the dwell", async () => {
    let flyCancelled = false;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      // The fly never lands on its own; it must be cancelled by the race.
      const p = new Promise<void>(() => {}) as Promise<void> & { [key: symbol]: () => void };
      p[CANCEL_SYM] = () => {
        flyCancelled = true;
      };
      return p;
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    const task = sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 0);
    await flush(); // saga reaches the fly race and awaits

    store.dispatch(advanceTour());
    const outcome = await task.toPromise();

    expect(outcome).toBe('next');
    expect(flyCancelled).toBe(true);
    // The dwell never started — the caption/ring nonce stays untouched.
    expect(store.getState().tour.dwellNonce).toBe(0);
  });

  it("returns 'prev' when prevBeat arrives mid-fly", async () => {
    const playClipMock = vi
      .fn<(clip: ClipData) => Promise<void>>()
      .mockImplementation(() => new Promise<void>(() => {}));

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    const task = sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 1);
    await flush();

    store.dispatch(prevBeat());
    const outcome = await task.toPromise();

    expect(outcome).toBe('prev');
    expect(store.getState().tour.dwellNonce).toBe(0);
  });

  // ── (4) advanceTour during the dwell resolves to 'next' ───────────────────

  it("returns 'next' when advanceTour wins the dwell race, and cancels the drift", async () => {
    let cancelCalled = false;
    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve();
      const p = new Promise<void>(() => {}) as Promise<void> & { [key: symbol]: () => void };
      p[CANCEL_SYM] = () => {
        cancelCalled = true;
      };
      return p;
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    const task = sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 0);

    await flush();
    await flush(); // saga reaches the dwell race

    store.dispatch(advanceTour());
    const outcome = await task.toPromise();

    expect(outcome).toBe('next');
    expect(cancelCalled).toBe(true);
  });

  // ── (5) prevBeat during the dwell resolves to 'prev' ──────────────────────

  it("returns 'prev' when prevBeat wins the dwell race", async () => {
    const { store, sagaMiddleware } = buildStore({ playClip: flyThenBlockingDrift(true) });

    const task = sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 1);

    await flush();
    await flush();

    store.dispatch(prevBeat());
    const outcome = await task.toPromise();

    expect(outcome).toBe('prev');
  });

  // ── (6) the dwell timeout auto-advances to 'next' ─────────────────────────

  it("returns 'next' when the dwell timer expires with no input", async () => {
    vi.useFakeTimers();

    const shortDwellBeat: BeatData = {
      enterClip: narrationClip,
      caption: null,
      dwellClip: dwellDrift(2),
    };
    const { sagaMiddleware } = buildStore({ playClip: flyThenBlockingDrift(true) });

    const task = sagaMiddleware.run(visitBeatSaga, shortDwellBeat, 0);

    await vi.runAllTimersAsync();
    const outcome = await task.toPromise();

    expect(outcome).toBe('next');
  });

  // ── (7) togglePause freezes the dwell; a second togglePause resumes it ────

  it('togglePause freezes the dwell (paused=true) and resumes on the next toggle', async () => {
    const { store, sagaMiddleware } = buildStore({ playClip: flyThenBlockingDrift(true) });

    const task = sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 0);

    await flush();
    await flush(); // reach the dwell race

    expect(store.getState().tour.paused).toBe(false);

    store.dispatch(togglePause());
    await flush();
    expect(store.getState().tour.paused).toBe(true);

    store.dispatch(togglePause());
    await flush();
    expect(store.getState().tour.paused).toBe(false);

    // Still running after resume — advanceTour ends it with 'next'.
    store.dispatch(advanceTour());
    const outcome = await task.toPromise();
    expect(outcome).toBe('next');
  });

  // ── (8) advanceTour while paused resolves to 'next' ───────────────────────

  it("returns 'next' when advanceTour arrives while paused", async () => {
    const { store, sagaMiddleware } = buildStore({ playClip: flyThenBlockingDrift(true) });

    const task = sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 0);

    await flush();
    await flush();

    store.dispatch(togglePause());
    await flush();
    expect(store.getState().tour.paused).toBe(true);

    store.dispatch(advanceTour());
    const outcome = await task.toPromise();

    expect(outcome).toBe('next');
    // The pause flag is cleared on the way out so the next beat starts clean.
    expect(store.getState().tour.paused).toBe(false);
  });

  // ── (9) a clip-less beat starts its dwell immediately ─────────────────────

  it('a beat with no enterClip skips the fly: the dwell starts at once and only the dwell clip plays', async () => {
    const playClipMock = flyThenBlockingDrift(true);
    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    const clipLessBeat: BeatData = { caption: { title: 'Still here' }, dwellClip: dwellDrift(5) };
    sagaMiddleware.run(visitBeatSaga, clipLessBeat, 1);

    await flush();

    // No establishing fly — the dwell begins immediately (nonce bumped, length
    // recorded) and the only playClip call is the dwell clip.
    expect(store.getState().tour.dwellNonce).toBe(1);
    expect(store.getState().tour.dwellSec).toBe(5);
    expect(playClipMock).toHaveBeenCalledTimes(1);
  });

  // ── (10) in-clip focus path: resolved clip carries a { kind: 'focus', ref } cue ──

  it('a flyAndFocusOnClip beat resolves its focusId cue to a concrete focus ref', async () => {
    const playClipMock = flyThenBlockingDrift(true);
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, resolveDeps: STRUCTURE_DEPS });

    sagaMiddleware.run(visitBeatSaga, structureBeat, 0);

    await flush();
    await flush();

    expect(playClipMock).toHaveBeenCalled();
    const resolvedClip = playClipMock.mock.calls[0]![0];

    const focusCues = collectTimelineNodes(resolvedClip.timeline, (e) => e).filter(
      (e) => e.kind === 'focus',
    ) as Array<{ kind: 'focus'; ref: unknown }>;
    expect(focusCues.length).toBeGreaterThan(0);
    expect(focusCues[0]).toEqual({
      kind: 'focus',
      ref: { type: 'structure', id: 'cluster-virgo' },
    });
  });
});
