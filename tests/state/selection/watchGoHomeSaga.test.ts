/**
 * watchGoHomeSaga tests — integration over a real store + saga middleware, with
 * the engine's `cameraRuntime` resource stubbed via `sagaMiddleware.setContext`
 * (mirroring `watchFocusTweenSaga.test.ts`). The `goHome` command is a plain
 * action, so the saga is driven by dispatching it and flushing a macrotask; the
 * null-runtime bail branch is exercised by swapping the stub to return null.
 * Home is a plain action, so there is no keyboard channel to mock — the saga is
 * driven purely by dispatching `goHome`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchGoHomeSaga } from '../../../src/state/selection/watchGoHomeSaga';
import { goHome } from '../../../src/state/selection/goHome';
import { EARTH_REF } from '../../../src/data/selection/earthRef';
import { earthHomePose } from '../../../src/services/engine/camera/earthHomePose';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { selectOrientation } from '../../../src/state/settings/selectors';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { cameraRoute, selectionRoute, timeRoute } from '../../../src/store/constants';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { LiveCameraRuntime } from '../../../src/store/types';

const flush = () => new Promise((r) => setTimeout(r, 0));

// A live from-pose to seed the tween. The saga overrides orientation with the
// sunlit home pose (home is the exception to orientation-preserving focus), so
// `from` is what the flight departs from, not what it arrives at.
const FROM: CameraPose = { target: [1, 1, 1], yaw: 0.5, pitch: -0.2, distance: 9 };
const FOV = 0.8;

describe('watchGoHomeSaga', () => {
  let store: ReturnType<typeof build>;
  let cameraRuntime: () => LiveCameraRuntime | null;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchGoHomeSaga);
    cameraRuntime = () => ({ from: FROM, fovYRad: FOV, upBasisQuat: [0, 0, 0, 1] });
    mw.setContext({ cameraRuntime: () => cameraRuntime() });
    return s;
  }
  beforeEach(() => {
    store = build();
  });

  it('goHome pins Earth (select + focus) and tweens to the sunlit home pose', async () => {
    // Freeze the clock at a clearly non-J2000 instant so the derived Earth
    // position — and thus the home pose — is deterministic and proves the saga
    // reads the live sim instant, not a hardcoded epoch.
    const now = performance.now();
    store.dispatch(setSimDays({ simDays: CONST_J2000 + 300, nowMs: now }));
    store.dispatch(pause({ nowMs: now }));

    // Off the default orientation, dispatched BEFORE goHome — so the `frame`
    // assertion below can only pass if the saga actually captures the live
    // setting rather than a hardcoded default.
    store.dispatch(setOrientation('galactic'));

    store.dispatch(goHome());
    await flush();

    const selection = store.getState()[selectionRoute];
    expect(selection.select).toEqual(EARTH_REF);
    expect(selection.focus).toEqual(EARTH_REF);

    const tween = store.getState()[cameraRoute].tween;
    expect(tween).not.toBeNull();
    expect(tween!.from).toEqual(FROM);

    // The pose is encoded through the store's committed orientation basis (not
    // legacy identity) — recomputing with that basis proves the saga threads it.
    const simDays = deriveSimDays(store.getState()[timeRoute], performance.now());
    const orientation = selectOrientation(store.getState());
    const frameBasis = ORIENTATION_FRAMES[orientation];
    expect(tween!.to).toEqual(earthHomePose(simDays, FOV, frameBasis));

    // The descriptor pins the orientation live at dispatch time, mirroring
    // `clip.frame` and `focusTweenDescriptor`'s `frame` — the driver re-expresses
    // the pose against it on a later switch.
    expect(tween!.frame).toBe(orientation);
  });

  it('goHome is a no-op when the camera runtime is null', async () => {
    cameraRuntime = () => null;

    store.dispatch(goHome());
    await flush();

    expect(store.getState()[cameraRoute].tween).toBeNull();
    expect(store.getState()[selectionRoute].select).toBeNull();
    expect(store.getState()[selectionRoute].focus).toBeNull();
  });
});
