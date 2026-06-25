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
 * ### waitUntil and the clipFociReady predicate
 *
 * `waitUntil` polls via `delay(POLL_MS)`. In the "waits until clip foci ready"
 * test, we use Vitest fake timers to advance past the poll delay without
 * real-time waits. All other tests use clips whose foci are immediately
 * resolvable (structure or milkyWay ids) so `waitUntil` exits on the first
 * synchronous predicate check.
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
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import { flyAndFocusOnClip } from '../../../src/state/tour/flyAndFocusOnClip';
import { focusId } from '../../../src/utils/animation/focusId';

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

const CAMERA_RUNTIME: FocusCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
};

// Structure resolved by id immediately — no catalog needed.
const STRUCTURE_DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
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
const milkyWayBeat: BeatData = { clip: milkyWayClip, caption: 'Our galaxy', dwellSec: 5 };

// A clip with no focus ids — trivially ready.
const narrationClip: ClipData = { start: 'live', timeline: [] };
const narrationBeat: BeatData = { clip: narrationClip, caption: 'Narration', dwellSec: 4 };

// A clip with a structure focus id — resolves immediately (structures are always in deps).
const structureClip: ClipData = flyAndFocusOnClip(focusId('cluster-virgo'));
const structureBeat: BeatData = { clip: structureClip, caption: 'Virgo Cluster', dwellSec: 3 };

// ─── Harness ────────────────────────────────────────────────────────────────

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
  const deps = opts.resolveDeps ?? STRUCTURE_DEPS;
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

  // ── (1) waits until clip foci are ready AND camera runtime is non-null ────

  it('visitBeatSaga waits until clip foci are ready and camera runtime is non-null before playing', async () => {
    vi.useFakeTimers();

    let cloudLoaded = false;
    let runtimeReady = false;

    // A famous-id clip — requires the famous cloud to be loaded.
    // We stub famousMeta with one entry whose id matches the clip.
    const FAMOUS_ID = 'm87';
    // Minimal single-row cloud shaped like a real GalaxyCatalog.
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

    // resolveFamous calls deps.catalogs.get(Source.FamousGalaxy); return the
    // cloud when loaded, undefined otherwise to simulate a lazy load.
    const lazyDeps: ResolveDeps = {
      catalogs: {
        get: (_source) => {
          return cloudLoaded ? CLOUD : undefined;
        },
      },
      famousMeta: [{ id: FAMOUS_ID, name: 'M87', pgc: 41361 } as never],
      structures: { byId: () => null },
    };

    const famousClip: ClipData = flyAndFocusOnClip(focusId(FAMOUS_ID));
    const famousBeat: BeatData = { clip: famousClip, caption: 'M87', dwellSec: 3 };

    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { sagaMiddleware } = buildStore({
      playClip: playClipMock,
      resolveDeps: lazyDeps,
      cameraRuntime: runtimeReady ? CAMERA_RUNTIME : null,
    });

    // Runtime is also dynamic — swap it in after sagaMiddleware.setContext.
    // We need to control cameraRuntime as a closure, so override the context:
    let currentRuntime: FocusCameraRuntime | null = null;
    // NOTE: redux-saga's setContext overwrites all keys; must include resolveDeps, cameraRuntime, and playClip.
    sagaMiddleware.setContext({
      resolveDeps: () => lazyDeps,
      cameraRuntime: () => currentRuntime,
      playClip: (clip: ClipData) => playClipMock(clip),
    });

    sagaMiddleware.run(visitBeatSaga, famousBeat);

    // Cloud not loaded, runtime null — saga blocked in waitUntil.
    await vi.advanceTimersByTimeAsync(200);
    expect(playClipMock).not.toHaveBeenCalled();

    // Cloud arrives but runtime still null.
    cloudLoaded = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(playClipMock).not.toHaveBeenCalled();

    // Runtime arrives — both conditions satisfied.
    currentRuntime = CAMERA_RUNTIME;
    await vi.runAllTimersAsync();

    // After both conditions satisfied, saga proceeds to call playClip.
    expect(playClipMock).toHaveBeenCalled();
  });

  // ── (2) passes the resolved clip to playClip ──────────────────────────────

  it('visitBeatSaga passes the resolved clip to playClip', async () => {
    // structureBeat uses flyAndFocusOnClip('cluster-virgo') which contains
    // moveTargetId, dollyToId, and focusId cues. After resolveClipFoci runs,
    // those must be replaced with setVec, set, and focus arms respectively.
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, resolveDeps: STRUCTURE_DEPS });

    sagaMiddleware.run(visitBeatSaga, structureBeat);

    await flush();
    await flush();

    // playClip should have been called — first call is the establishing clip.
    expect(playClipMock).toHaveBeenCalled();
    const resolvedClip = playClipMock.mock.calls[0]![0];

    // Walk the resolved clip's timeline and assert no unresolved id-bearing cues remain.
    const kinds = collectTimelineNodes(resolvedClip.timeline, (e) => e.kind);
    // No id-bearing kinds should remain after resolution.
    expect(kinds).not.toContain('moveTargetId');
    expect(kinds).not.toContain('dollyToId');
    expect(kinds).not.toContain('focusId');
    // Concrete resolved forms should be present.
    expect(kinds).toContain('setVec'); // resolved moveTargetId → setVec
    expect(kinds).toContain('set'); // resolved dollyToId → set
    expect(kinds).toContain('focus'); // resolved focusId → focus
  });

  // ── (3) awaits the fly clip before showing the caption ───────────────────

  it('visitBeatSaga awaits the fly clip before showing the caption', async () => {
    let resolveFly!: () => void;
    const flyPromise = new Promise<void>((res) => {
      resolveFly = res;
    });

    // First call = establishing clip (held); second call = dwell drift (blocks).
    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? flyPromise : new Promise<void>(() => {});
    });

    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeatSaga, milkyWayBeat);

    await flush(); // saga runs to the clip call and awaits

    // Caption not shown yet — we're still in the clip.
    expect(store.getState().ui.caption).toBeNull();

    // Dispatch advanceTour during the clip — must have no effect (clip not done).
    store.dispatch(advanceTour());
    await flush();

    // Still no caption.
    expect(store.getState().ui.caption).toBeNull();

    // Resolve the fly.
    resolveFly();
    await flush();
    await flush(); // post-clip effects + showCaption

    // Caption now visible — the saga proceeded after the clip resolved.
    expect(store.getState().ui.caption).toBe(milkyWayBeat.caption);
  });

  // ── (4) shows then clears the caption ────────────────────────────────────

  it('visitBeatSaga shows then clears the caption', async () => {
    // Clip resolves; drift blocks so advanceTour drives the race.
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

    // Clip resolves immediately. Drift returns a never-resolving Promise with a
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

  // ── (6) the dwell timeout auto-advances ──────────────────────────────────

  it('the dwell timeout auto-advances when no click arrives', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? Promise.resolve() : new Promise<void>(() => {});
    });

    const shortDwellBeat: BeatData = { clip: narrationClip, caption: 'Short dwell', dwellSec: 2 };
    const { store, sagaMiddleware } = buildStore({ playClip: playClipMock });

    sagaMiddleware.run(visitBeatSaga, shortDwellBeat);

    // Advance past the clip (already resolved) + past the 2s dwell timer.
    await vi.runAllTimersAsync();

    expect(store.getState().ui.caption).toBeNull();
  });

  // ── (7) in-clip focus path: flyAndFocusOnClip resolved clip carries focus cue ──

  it('a flyAndFocusOnClip beat resolved clip carries a { kind: "focus", ref } cue', async () => {
    // flyAndFocusOnClip('cluster-virgo') produces a clip with a focusId('cluster-virgo')
    // cue. After resolveClipFoci runs against STRUCTURE_DEPS, it must become a
    // concrete { kind: 'focus', ref: { type: 'structure', id: 'cluster-virgo' } } cue.
    const playClipMock = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { sagaMiddleware } = buildStore({ playClip: playClipMock, resolveDeps: STRUCTURE_DEPS });

    sagaMiddleware.run(visitBeatSaga, structureBeat);

    await flush();
    await flush();

    expect(playClipMock).toHaveBeenCalled();
    const resolvedClip = playClipMock.mock.calls[0]![0];

    // Collect all focus-kind cues from the timeline.
    const focusCues = collectTimelineNodes(resolvedClip.timeline, (e) => e).filter(
      (e) => e.kind === 'focus',
    ) as Array<{ kind: 'focus'; ref: unknown }>;
    expect(focusCues.length).toBeGreaterThan(0);
    // The resolved focus cue carries the structure ref.
    expect(focusCues[0]).toEqual({
      kind: 'focus',
      ref: { type: 'structure', id: 'cluster-virgo' },
    });
  });
});
