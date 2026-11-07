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
import { SCENE_SETTLE_TIMEOUT_MS } from '../../../src/state/tour/sceneSettleTimeoutMs';
import { advanceTour, prevBeat, togglePause } from '../../../src/state/tour/tourActions';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import { Source } from '../../../src/data/source';
import { FAMOUS_GALAXY_NAMES } from '../../../src/layers/galaxyCatalog/famousGalaxies/data/famousGalaxyNames.generated';
import type { GalaxyRowFixture, StructureRowFixture } from '../../support/selectionResolverOver';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import { flyAndFocusOnClip } from '../../../src/state/tour/flyAndFocusOnClip';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import { focusId } from '../../../src/utils/animation/focusId';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import { clockTo } from '../../../src/state/tour/clockTo';
import { watchClockToSaga } from '../../../src/state/tour/watchClockToSaga';
import { pause, setSimDays } from '../../../src/state/time/timeSlice';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';

installAppSelectionKinds();

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
  aspect: 16 / 9,
  upBasisQuat: [0, 0, 0, 1],
};

// Structure resolved by id immediately — no catalog needed.
const STRUCTURES: StructureRowFixture = {
  byId: (id) =>
    ({
      type: 'structure',
      id,
      name: 'Test Structure',
      category: 'galaxy-cluster',
      worldPos: [1, 2, 3] as [number, number, number],
      physicalRadiusMpc: 1,
      apparentRadiusMpc: 2,
      featured: true,
    }) as const,
  byCategory: () => [],
};

// ─── Beat fixtures ───────────────────────────────────────────────────────────

// A clip with a milkyWay focus id — resolves immediately without catalog data.
const milkyWayClip: ClipData = flyAndFocusOnClip(focusId('milkyWay'));
const milkyWayBeat: BeatData = {
  enterClip: milkyWayClip,
  caption: { title: 'Our galaxy', lines: ['x'] },
  dwellClip: dwellDrift(5),
};

// A clip with no focus ids — trivially ready. Used for the silent
// (null-caption) short-dwell beat in the timeout test.
const narrationClip: ClipData = { start: 'live', timeline: [] };

// A clip with a structure focus id — resolves immediately (the store stub always has it).
const structureClip: ClipData = flyAndFocusOnClip(focusId('galaxy-cluster-virgo'));
const structureBeat: BeatData = {
  enterClip: structureClip,
  caption: { title: 'Virgo Cluster', lines: ['x'] },
  dwellClip: dwellDrift(3),
};

// ─── Harness ────────────────────────────────────────────────────────────────

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

function buildStore(opts: {
  playClip?: PlayClipStub;
  structures?: StructureRowFixture;
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
  const structures = opts.structures ?? STRUCTURES;
  const cam = opts.cameraRuntime !== undefined ? opts.cameraRuntime : CAMERA_RUNTIME;

  sagaMiddleware.setContext({
    selection: selectionResolverOver(structures),
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

    // A famous cloud names its rows only at the compiled-in table's length; every row is row 0.
    const FAMOUS_ID = FAMOUS_GALAXY_NAMES[0]!.id;
    const ROWS = FAMOUS_GALAXY_NAMES.length;
    const filled = (value: number) => new Float32Array(ROWS).fill(value);
    const CLOUD: GalaxyCatalog = makeGalaxyCatalog(ROWS, {
      positions: Float32Array.from({ length: ROWS * 3 }, (_, i) => (i % 3 === 0 ? 1 : 0)),
      spectroscopicZ: filled(0.01),
      magU: filled(18),
      magG: filled(17),
      magR: filled(16),
      magI: filled(16),
      magZ: filled(16),
      diameterKpc: filled(30),
      axisRatio: filled(1),
    });

    const lazyStructures: StructureRowFixture = { byId: () => null, byCategory: () => [] };
    // Read LIVE: the beat's readiness gate must clear only once the cloud lands.
    const lazyGalaxies = {
      get catalogs() {
        return cloudLoaded ? new Map([[Source.FamousGalaxy, CLOUD]]) : new Map();
      },
    } as unknown as GalaxyRowFixture;

    const famousBeat: BeatData = {
      enterClip: flyAndFocusOnClip(focusId(FAMOUS_ID)),
      caption: { title: 'M87', lines: ['x'] },
      dwellClip: dwellDrift(3),
    };

    const playClipMock = flyThenBlockingDrift(true);
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, structures: lazyStructures });

    // Camera runtime is dynamic; override the context with a closure read.
    let currentRuntime: LiveCameraRuntime | null = null;
    sagaMiddleware.setContext({
      selection: selectionResolverOver(lazyStructures, lazyGalaxies),
      cameraRuntime: () => currentRuntime,
      playClip: (clip: ClipData) => playClipMock(clip),
    });

    sagaMiddleware.run(visitBeatSaga, famousBeat, 0);

    // Cloud not loaded, runtime null — saga blocked in waitUntilSaga.
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
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, structures: STRUCTURES });

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

  it('the tour pause holds a timed clockTo mid-run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    const JD = 2_460_000;
    // The dwell stands in for a clip whose `scene(clockTo(…))` cue fires as it starts.
    let dispatch: (action: ReturnType<typeof clockTo>) => void = () => {};
    let n = 0;
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      if (++n === 1) return Promise.resolve();
      dispatch(clockTo({ simDays: JD + 1, overSec: 30 }));
      return new Promise<void>(() => {});
    });
    const { store, sagaMiddleware } = buildStore({ playClip });
    dispatch = store.dispatch;
    sagaMiddleware.run(watchClockToSaga);
    store.dispatch(setSimDays({ simDays: JD, nowMs: performance.now() }));
    store.dispatch(pause({ nowMs: performance.now() }));
    const at = () => deriveSimDays(store.getState().time, performance.now());
    const beat: BeatData = { ...milkyWayBeat, enterClip: narrationClip, dwellClip: dwellDrift(60) };

    sagaMiddleware.run(visitBeatSaga, beat, 0);
    await vi.advanceTimersByTimeAsync(5_000);
    store.dispatch(togglePause());
    const held = at();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(held).toBeGreaterThan(JD);
    expect(at()).toBe(held);
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

    const clipLessBeat: BeatData = {
      caption: { title: 'Still here', lines: ['x'] },
      dwellClip: dwellDrift(5),
    };
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
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, structures: STRUCTURES });

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
      ref: { type: 'structure', id: 'galaxy-cluster-virgo' },
    });
  });

  // ── (11) the cold-load gate: after the fly lands, before caption + dwell ──

  it('awaitSettled holds the dwell after the fly lands until the scene has settled', async () => {
    vi.useFakeTimers();
    let settled = false;
    const playClipMock = flyThenBlockingDrift(true);
    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });
    sagaMiddleware.setContext({ sceneSettled: () => settled });

    sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 0, { awaitSettled: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(playClipMock).toHaveBeenCalledTimes(1);
    expect(store.getState().tour.dwellNonce).toBe(0);

    settled = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(store.getState().tour.dwellNonce).toBe(1);
  });

  it('the gate gives up after SCENE_SETTLE_TIMEOUT_MS, so a tile that never lands cannot hang the tour', async () => {
    vi.useFakeTimers();
    const playClipMock = flyThenBlockingDrift(true);
    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });
    sagaMiddleware.setContext({ sceneSettled: () => false });

    sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 0, { awaitSettled: true });
    await vi.advanceTimersByTimeAsync(SCENE_SETTLE_TIMEOUT_MS - 200);
    expect(store.getState().tour.dwellNonce).toBe(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(store.getState().tour.dwellNonce).toBe(1);
  });

  it("advanceTour during the gate returns 'next' without starting the dwell", async () => {
    vi.useFakeTimers();
    const playClipMock = flyThenBlockingDrift(true);
    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });
    sagaMiddleware.setContext({ sceneSettled: () => false });

    const task = sagaMiddleware.run(visitBeatSaga, milkyWayBeat, 0, { awaitSettled: true });
    await vi.advanceTimersByTimeAsync(300);
    store.dispatch(advanceTour());
    await vi.advanceTimersByTimeAsync(0);
    expect(await task.toPromise()).toBe('next');
    expect(store.getState().tour.dwellNonce).toBe(0);
  });
});
