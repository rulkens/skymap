/**
 * watchClipSaga tests — integration over a real store + saga middleware.
 *
 * `watchClipSaga` resolves the dispatched `ClipId` against `clipRegistry` and
 * runs the injected `playClip` seam (read from saga context) with the resolved
 * `ClipData` for each `startClip` action, cancelling it on `stopClip` or a
 * re-play (takeLatest). Cancellation is observed via the seam Promise's
 * `[CANCEL]` hook — the same mechanism the production `playClip` seam attaches to
 * route cancellation into `clipPlayer.stop()`.
 *
 * The seam itself is stubbed, so these tests assert the saga's routing
 * contract (resolve + run on play, cancel on stop / re-play), not the clip player.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';
import { CANCEL } from '@redux-saga/core';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchClipSaga } from '../../../src/state/camera/watchClipSaga';
import { startClip, stopClip } from '../../../src/state/camera/clipActions';
import { setRate, setSimDays, goLive, pause, resume } from '../../../src/state/time/timeSlice';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { clipRegistry } from '../../../src/data/animation/clips/clipRegistry';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// CANCEL is typed as `string` in @redux-saga/core, but its runtime value is a
// Symbol. Cast so we can use it as a property key on the seam Promise stub.
const CANCEL_SYM = CANCEL as unknown as symbol;

const flush = () => new Promise((r) => setTimeout(r, 0));

// A real registered clip — the saga resolves the id to this clip's ClipData
// before handing it to the seam.
const CLIP_ID = 'flyout' as const;
const EXPECTED = clipRegistry[CLIP_ID].data;

type PlayClipStub = ReturnType<typeof vi.fn<(clip: ClipData) => Promise<void>>>;

/** A seam stub that never resolves but records cancellation via [CANCEL]. */
function blockingSeam(onCancel: () => void): PlayClipStub {
  return vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
    const p = new Promise<void>(() => {}) as Promise<void> & { [key: symbol]: () => void };
    p[CANCEL_SYM] = onCancel;
    return p;
  });
}

// Default deps resolve nothing — fine for focus-free clips like flyout.
const EMPTY_DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: { byId: () => null },
  stars: { current: () => null },
};

const RUNTIME: LiveCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
  fovYRad: 0.8,
  upBasisQuat: [0, 0, 0, 1],
};

function buildHarness(seam: PlayClipStub, resolveDeps: ResolveDeps = EMPTY_DEPS) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({
    playClip: (clip: ClipData) => seam(clip),
    resolveDeps: () => resolveDeps,
    cameraRuntime: () => RUNTIME,
  });
  sagaMiddleware.run(watchClipSaga);
  return { store };
}

describe('watchClipSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Tear down the `performance.now` spy the clock-freeze tests install.
    vi.restoreAllMocks();
  });

  it('resolves the id and runs the playClip seam with the clip data on a startClip action', async () => {
    const seam = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store } = buildHarness(seam);

    store.dispatch(startClip(CLIP_ID));
    await flush();

    expect(seam).toHaveBeenCalledTimes(1);
    expect(seam).toHaveBeenCalledWith(EXPECTED);
  });

  it('cancels the in-flight seam when stopClip is dispatched', async () => {
    let cancelled = false;
    const seam = blockingSeam(() => {
      cancelled = true;
    });
    const { store } = buildHarness(seam);

    store.dispatch(startClip(CLIP_ID));
    await flush();
    expect(cancelled).toBe(false);

    store.dispatch(stopClip());
    await flush();

    // The race's stop arm wins → the run call is cancelled → [CANCEL] fires.
    expect(cancelled).toBe(true);
  });

  it('resolves a focus-bearing clip before handing it to the seam', async () => {
    // Regression: the standalone clip-play path must run resolveClipFoci, like
    // the tour does. A flyPath with atFocus waypoints would otherwise reach
    // compileClip unresolved and throw at the first frame.
    const groups: Record<string, StructureInfo> = {
      'group-m81-group': {
        type: 'structure',
        category: 'group',
        id: 'group-m81-group',
        name: 'M81 Group',
        worldPos: [10, 0, 0],
        featured: true,
        physicalRadiusMpc: 2,
      } as StructureInfo,
      'group-cen-a-group': {
        type: 'structure',
        category: 'group',
        id: 'group-cen-a-group',
        name: 'Cen A Group',
        worldPos: [0, 10, 0],
        featured: true,
        physicalRadiusMpc: 3,
      } as StructureInfo,
      'group-sculptor-group': {
        type: 'structure',
        category: 'group',
        id: 'group-sculptor-group',
        name: 'Sculptor Group',
        worldPos: [0, 0, 10],
        featured: true,
        physicalRadiusMpc: 2,
      } as StructureInfo,
    };
    const deps: ResolveDeps = {
      catalogs: { get: () => undefined },
      famousGalaxiesMeta: [],
      structures: { byId: (id) => groups[id] ?? null },
      stars: { current: () => null },
    };

    const seam = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store } = buildHarness(seam, deps);

    store.dispatch(startClip('flyPathDemo'));
    await flush();

    expect(seam).toHaveBeenCalledTimes(1);
    const handed = seam.mock.calls[0]![0];
    const fp = handed.timeline[0]!;
    if (fp.kind !== 'flyPath') throw new Error('expected a flyPath effect');
    // Every waypoint is resolved to at-form — no id-bearing waypoints survive.
    for (const w of fp.waypoints) {
      expect('at' in w).toBe(true);
    }
  });

  it('cancels the prior run when a second startClip arrives (takeLatest)', async () => {
    let cancelCount = 0;
    const seam = blockingSeam(() => {
      cancelCount++;
    });
    const { store } = buildHarness(seam);

    store.dispatch(startClip(CLIP_ID));
    await flush();
    store.dispatch(startClip(CLIP_ID));
    await flush();

    // takeLatest cancelled the first run (one [CANCEL]); both runs called the seam.
    expect(cancelCount).toBe(1);
    expect(seam).toHaveBeenCalledTimes(2);
  });

  it('pauses the sim clock on clip start, freezing the pre-clip instant', async () => {
    // A blocking seam keeps the clip "playing", so the clock stays frozen for
    // the assertion (no restore fires while the run arm is still pending).
    const seam = blockingSeam(() => {});
    const { store } = buildHarness(seam);

    // A manual clock advancing at the default '1 s/s' detent from a known anchor.
    const T0 = 1000;
    store.dispatch(setSimDays({ simDays: 2451545, nowMs: T0 }));

    // Freeze the wall clock so the saga's `pause` nowMs is deterministic.
    const T1 = 4000; // 3 real seconds later
    vi.spyOn(performance, 'now').mockReturnValue(T1);

    const preClip = store.getState().time;
    const frozenAt = deriveSimDays(preClip, T1);

    store.dispatch(startClip(CLIP_ID));
    await flush();

    const after = store.getState().time;
    expect(after.paused).toBe(true);
    // Re-anchored from the pre-clip derived instant: the clock holds exactly the
    // sim time it read the moment the clip began, and no later nowMs moves it.
    expect(deriveSimDays(after, 999_999)).toBe(frozenAt);
  });

  it('resolves an instant-dependent clip at the frozen clip-start instant', async () => {
    // `earthFlyout` opens on Earth's LIVE position. The play site freezes the
    // clock at clip start and must build the clip at THAT instant, so the shot
    // opens where Earth is drawn — not at the J2000 epoch the static registry
    // bakes. Drive the clock to a non-J2000 instant, start the clip, and assert
    // the seam receives a start target equal to that instant's Earth position
    // and DIFFERENT from J2000's.
    const seam = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store } = buildHarness(seam);

    // A paused manual clock at a non-J2000 instant makes the frozen instant
    // deterministic regardless of nowMs (paused ⇒ anchor.simDays verbatim).
    const SIM = CONST_J2000 + 200; // ~200 days along Earth's orbit
    store.dispatch(setSimDays({ simDays: SIM, nowMs: 1000 }));
    store.dispatch(pause({ nowMs: 1000 }));

    store.dispatch(startClip('earthFlyout'));
    await flush();

    expect(seam).toHaveBeenCalledTimes(1);
    const handed = seam.mock.calls[0]![0];
    // earthFlyout bakes a concrete start pose (not a 'live' capture).
    const start = handed.start;
    if (start === undefined || start === 'live') throw new Error('expected a baked start pose');
    const liveEarth = deriveBodyStates(SIM).get('earth')!.positionMpc;
    const j2000Earth = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;

    // Opened on the live instant's Earth, to sub-Mpc precision.
    expect(start.target[0]).toBeCloseTo(liveEarth[0]);
    expect(start.target[1]).toBeCloseTo(liveEarth[1]);
    expect(start.target[2]).toBeCloseTo(liveEarth[2]);
    // And NOT the J2000 pose the static registry would have baked — the whole
    // point of resolving at the frozen instant.
    expect(start.target).not.toEqual([j2000Earth[0], j2000Earth[1], j2000Earth[2]]);
  });

  it('restores live mode after a clip that started from live', async () => {
    const seam = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store } = buildHarness(seam);

    store.dispatch(goLive({ simDays: 2451545, nowMs: 100 }));
    expect(store.getState().time.mode).toBe('live');

    store.dispatch(startClip(CLIP_ID));
    await flush();
    await flush();

    const after = store.getState().time;
    expect(after.mode).toBe('live');
    expect(after.paused).toBe(false);
  });

  it('restores manual playback after a clip, including the cancel path', async () => {
    // Blocking seam so the clip only ends via the explicit stopClip below.
    const seam = blockingSeam(() => {});
    const { store } = buildHarness(seam);

    // A manual clock, actively playing (not paused).
    store.dispatch(setRate({ rateIndex: 2, nowMs: 100 }));
    expect(store.getState().time).toMatchObject({ mode: 'manual', paused: false });

    store.dispatch(startClip(CLIP_ID));
    await flush();
    expect(store.getState().time.paused).toBe(true); // frozen for the clip

    // Cancel via stopClip — the finally restore must still run on this path.
    store.dispatch(stopClip());
    await flush();

    const after = store.getState().time;
    expect(after.mode).toBe('manual');
    expect(after.paused).toBe(false);
  });

  it('leaves an already-paused manual clock paused after a clip (no resume/goLive)', async () => {
    // A deliberately-paused manual clock must not be un-paused by a clip. The
    // finally-restore must dispatch neither `resume` nor `goLive` on this path.
    const seam = blockingSeam(() => {});
    const { store } = buildHarness(seam);

    // A manual clock that the user has paused.
    store.dispatch(setRate({ rateIndex: 2, nowMs: 100 }));
    store.dispatch(pause({ nowMs: 100 }));
    expect(store.getState().time).toMatchObject({ mode: 'manual', paused: true });

    // Spy after the pre-clip setup so only the saga's dispatches are counted.
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    store.dispatch(startClip(CLIP_ID));
    await flush();
    expect(store.getState().time.paused).toBe(true); // still paused during the clip

    // Cancel via stopClip so the finally-restore runs on the clip's exit.
    store.dispatch(stopClip());
    await flush();

    const after = store.getState().time;
    expect(after.mode).toBe('manual');
    expect(after.paused).toBe(true);
    // No restore action un-paused the clock.
    const restored = dispatchSpy.mock.calls
      .map(([action]) => (action as { type: string }).type)
      .filter((t) => t === resume.type || t === goLive.type);
    expect(restored).toEqual([]);
  });
});
