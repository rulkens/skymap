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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';
import { CANCEL } from '@redux-saga/core';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchClipSaga } from '../../../src/state/camera/watchClipSaga';
import { startClip, stopClip } from '../../../src/state/camera/clipActions';
import { clipRegistry } from '../../../src/data/animation/clips/clipRegistry';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';
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
  famousMeta: [],
  structures: { byId: () => null },
  stars: { current: () => null },
};

const RUNTIME: FocusCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
  fovYRad: 0.8,
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
      famousMeta: [],
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
});
