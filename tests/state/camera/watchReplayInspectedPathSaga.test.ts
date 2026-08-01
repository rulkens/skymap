/**
 * watchReplayInspectedPathSaga tests — integration over a real store + saga
 * middleware.
 *
 * The saga bridges the inspector's pinned clip to the clip-player: on
 * `replayInspectedPath` it reads `clipPathInspect.pinnedClip()` (the foci-
 * resolved, start-pinned clip the last "Calculate" produced) and replays it
 * through the `playClip` seam, so the flown route is byte-for-byte the inspected
 * overlay — no fresh `start: 'live'` resolution. With nothing calculated yet
 * (`pinnedClip()` null) it's a harmless no-op. Both seams are stubbed, so these
 * tests assert the routing contract, not the playback.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchReplayInspectedPathSaga } from '../../../src/state/camera/watchReplayInspectedPathSaga';
import { replayInspectedPath } from '../../../src/state/camera/clipActions';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../src/@types/animation/ClipId';
import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';

const flush = () => new Promise((r) => setTimeout(r, 0));

const PINNED: ClipData = {
  start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5 },
  timeline: [],
};

function buildHarness(pinned: ClipData | null) {
  const playClip = vi.fn<(clip: ClipData, frame: OrientationFrameId) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const pinnedClip = vi.fn<() => ClipData | null>(() => pinned);
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({
    playClip,
    clipPathInspect: {
      compute: vi.fn<(clipId: ClipId, resolved: ClipData) => void>(),
      recompute: vi.fn<(clipId: ClipId, resolved: ClipData) => void>(),
      clear: vi.fn<() => void>(),
      pinnedClip,
    },
  });
  sagaMiddleware.run(watchReplayInspectedPathSaga);
  return { store, playClip };
}

describe('watchReplayInspectedPathSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replays the inspector's pinned clip through playClip on replayInspectedPath", async () => {
    const { store, playClip } = buildHarness(PINNED);
    store.dispatch(replayInspectedPath());
    await flush();

    expect(playClip).toHaveBeenCalledTimes(1);
    // The store's default orientation — this saga selects it fresh at replay
    // dispatch time, not whatever frame the inspector originally sampled under.
    expect(playClip).toHaveBeenCalledWith(PINNED, DEFAULT_ORIENTATION);
  });

  it('is a no-op when nothing has been calculated (pinnedClip null)', async () => {
    const { store, playClip } = buildHarness(null);
    store.dispatch(replayInspectedPath());
    await flush();

    expect(playClip).not.toHaveBeenCalled();
  });
});
