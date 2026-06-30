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
import { inspectClipPath, clearClipPath } from '../../../src/state/settings/settingsSlice';
import { clipRegistry } from '../../../src/data/animation/clips/clipRegistry';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../src/@types/animation/ClipId';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';

const flush = () => new Promise((r) => setTimeout(r, 0));

const CLIP_ID: ClipId = 'flyout';
const EXPECTED = clipRegistry[CLIP_ID].data;

const EMPTY_DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousMeta: [],
  structures: { byId: () => null },
};

const RUNTIME: FocusCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
  fovYRad: 0.8,
};

function buildHarness() {
  const compute = vi.fn<(clipId: ClipId, resolved: ClipData) => void>();
  const clear = vi.fn<() => void>();
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({
    clipPathInspect: { compute, clear },
    resolveDeps: () => EMPTY_DEPS,
    cameraRuntime: () => RUNTIME,
  });
  sagaMiddleware.run(watchClipPathInspectSaga);
  return { store, compute, clear };
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
    expect(compute).toHaveBeenCalledWith(CLIP_ID, EXPECTED);
  });

  it('calls clear on clearClipPath', async () => {
    const { store, clear } = buildHarness();
    store.dispatch(clearClipPath());
    await flush();

    expect(clear).toHaveBeenCalledTimes(1);
  });
});
