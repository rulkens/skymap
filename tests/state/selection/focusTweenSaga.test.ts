import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFocusTween } from '../../../src/state/selection/focusTweenSaga';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';
import { cameraRoute } from '../../../src/store/constants';
import { MILKY_WAY_VIEW_DISTANCE_MPC } from '../../../src/data/milkyWay/galacticCenter';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { FocusCameraRuntime } from '../../../src/store/types';

const flush = () => new Promise((r) => setTimeout(r, 0));

// A live from-pose to seed the tween. The Milky-Way arm preserves yaw/pitch and
// targets a fixed distance, so the dispatched descriptor is fully determined by
// (ref type, from-pose) — no engine cloud needed for the milkyWay case.
const FROM: CameraPose = { target: [1, 1, 1], yaw: 0.5, pitch: -0.2, distance: 9 };

// resolveDeps stub — the milkyWay ref resolves without touching catalogs.
const resolveDeps = (): ResolveDeps =>
  ({
    catalogs: { get: () => undefined },
    famousMeta: undefined,
    structures: { byId: () => undefined },
  }) as unknown as ResolveDeps;

describe('watchFocusTween', () => {
  let store: ReturnType<typeof build>;
  let cameraRuntime: () => FocusCameraRuntime | null;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchFocusTween);
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8 });
    mw.setContext({ resolveDeps, cameraRuntime: () => cameraRuntime() });
    return s;
  }
  beforeEach(() => {
    store = build();
  });

  it('a focus ref change dispatches startCameraTween with the built descriptor', async () => {
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);
    expect(tween!.to.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
    expect(tween!.to.yaw).toBe(FROM.yaw);
  });

  it('a select (non-focus) write does NOT start a tween', async () => {
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  it('no-ops when the camera is not ready (cameraRuntime returns null)', async () => {
    cameraRuntime = () => null;
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  it('a null focus ref (release) resolves to no row → no tween', async () => {
    store.dispatch(updateSelectionFocus(null));
    await flush();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });
});
