/**
 * watchClipPathInspectSaga tests — integration over a real store + saga
 * middleware.
 *
 * The saga routes the settings-slice `inspectClipPath` / `clearClipPath` actions
 * to the injected `clipPathInspect` seam (read from saga context): resolve the id
 * against `clipRegistry`, resolve its foci, and call `compute` on inspect; call
 * `clear` on clear. The seam is stubbed, so these tests assert the routing
 * contract, not the sampling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchClipPathInspectSaga } from '../../../src/state/camera/watchClipPathInspectSaga';
import {
  inspectClipPath,
  recalcClipPath,
  clearClipPath,
} from '../../../src/state/settings/settingsSlice';
import { clipRegistry } from '../../../src/data/animation/clips/clipRegistry';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../src/@types/animation/ClipId';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';

const flush = () => new Promise((r) => setTimeout(r, 0));

const CLIP_ID: ClipId = 'flyout';
const EXPECTED = clipRegistry[CLIP_ID].data;
// The saga resolves `ORIENTATION_FRAMES[settings.orientation]` and threads it
// into the seam call — the default store's orientation seeds `DEFAULT_ORIENTATION`.
const EXPECTED_FRAME_BASIS = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];

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

type ComputeFn = (
  clipId: ClipId,
  resolved: ClipData,
  frameBasis?: Mat3,
  frame?: OrientationFrameId,
) => void;

function buildHarness() {
  const compute = vi.fn<ComputeFn>();
  const recompute = vi.fn<ComputeFn>();
  const clear = vi.fn<() => void>();
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({
    clipPathInspect: {
      compute,
      recompute,
      clear,
      pinnedClip: vi.fn<() => ClipData | null>(() => null),
      pinnedFrame: vi.fn<() => OrientationFrameId | null>(() => null),
    },
    resolveDeps: () => EMPTY_DEPS,
    cameraRuntime: () => RUNTIME,
  });
  sagaMiddleware.run(watchClipPathInspectSaga);
  return { store, compute, recompute, clear };
}

describe('watchClipPathInspectSaga', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the id and calls compute with the clip data on inspectClipPath', async () => {
    const { store, compute } = buildHarness();
    store.dispatch(inspectClipPath(CLIP_ID));
    await flush();

    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledWith(
      CLIP_ID,
      EXPECTED,
      EXPECTED_FRAME_BASIS,
      DEFAULT_ORIENTATION,
    );
  });

  it('routes recalcClipPath to recompute (keep-start), not compute', async () => {
    const { store, compute, recompute } = buildHarness();
    store.dispatch(recalcClipPath(CLIP_ID));
    await flush();

    expect(recompute).toHaveBeenCalledTimes(1);
    expect(recompute).toHaveBeenCalledWith(
      CLIP_ID,
      EXPECTED,
      EXPECTED_FRAME_BASIS,
      DEFAULT_ORIENTATION,
    );
    expect(compute).not.toHaveBeenCalled();
  });

  it('calls clear on clearClipPath', async () => {
    const { store, clear } = buildHarness();
    store.dispatch(clearClipPath());
    await flush();

    expect(clear).toHaveBeenCalledTimes(1);
  });
});
