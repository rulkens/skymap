/**
 * watchReplayInspectedPathSaga tests — integration over a real store + saga
 * middleware.
 *
 * The saga bridges the inspector's pinned clip to the clip-player: on
 * `replayInspectedPath` it reads `clipPathInspect.pinnedClip()` (the foci-
 * resolved, start-pinned clip the last "Calculate" produced) and replays it
 * through the `playClip` seam, so the flown route is byte-for-byte the inspected
 * overlay — no fresh `start: 'live'` resolution. `pinnedFrame()` supplies the
 * frame those bearings were baked under; nothing gates `settings.orientation`
 * between Calculate and Play, so this must NOT be a fresh `select` (see
 * `watchReplayInspectedPathSaga.ts`'s module header). With nothing calculated
 * yet (`pinnedClip()` null) it's a harmless no-op. Both seams are stubbed, so
 * these tests assert the routing contract, not the playback.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchReplayInspectedPathSaga } from '../../../src/state/camera/watchReplayInspectedPathSaga';
import { replayInspectedPath } from '../../../src/state/camera/clipActions';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../src/@types/animation/ClipId';
import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';

const flush = () => new Promise((r) => setTimeout(r, 0));

const PINNED: ClipData = {
  start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5 },
  timeline: [],
};

function buildHarness(pinned: ClipData | null, frame: OrientationFrameId | null) {
  const playClip = vi.fn<(clip: ClipData, frame: OrientationFrameId) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const pinnedClip = vi.fn<() => ClipData | null>(() => pinned);
  const pinnedFrame = vi.fn<() => OrientationFrameId | null>(() => frame);
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
      pinnedFrame,
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
    const { store, playClip } = buildHarness(PINNED, 'ecliptic');
    store.dispatch(replayInspectedPath());
    await flush();

    expect(playClip).toHaveBeenCalledTimes(1);
    expect(playClip).toHaveBeenCalledWith(PINNED, 'ecliptic');
  });

  it('is a no-op when nothing has been calculated (pinnedClip null)', async () => {
    const { store, playClip } = buildHarness(null, null);
    store.dispatch(replayInspectedPath());
    await flush();

    expect(playClip).not.toHaveBeenCalled();
  });

  it('is a no-op when pinnedFrame is null even though a clip is pinned (invariant guard)', async () => {
    const { store, playClip } = buildHarness(PINNED, null);
    store.dispatch(replayInspectedPath());
    await flush();

    expect(playClip).not.toHaveBeenCalled();
  });

  it('replays under the frame Calculate baked the route under, not the live setting at Play time', async () => {
    // Regression: Calculate bakes lookAt/flyPath bearings through the frame
    // live AT THAT MOMENT. Nothing locks the orientation control afterward, so
    // the curator can switch it before hitting Play. The replay must decode
    // those Calculate-baked bearings through the SAME frame, or it reinterprets
    // them against the wrong pole — exactly the defect this branch removes,
    // relocated from mid-playback to between the two clicks.
    const { store, playClip } = buildHarness(PINNED, 'ecliptic');

    // The setting the curator switches to AFTER Calculate, BEFORE Play.
    store.dispatch(setOrientation('galactic'));

    store.dispatch(replayInspectedPath());
    await flush();

    expect(playClip).toHaveBeenCalledTimes(1);
    // Compute-time frame ('ecliptic'), NOT the live setting ('galactic').
    expect(playClip).toHaveBeenCalledWith(PINNED, 'ecliptic');
  });
});
