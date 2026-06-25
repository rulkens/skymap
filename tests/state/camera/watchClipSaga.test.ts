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

function buildHarness(seam: PlayClipStub) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({ playClip: (clip: ClipData) => seam(clip) });
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
