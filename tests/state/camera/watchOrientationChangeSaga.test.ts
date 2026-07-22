import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import {
  watchOrientationChangeSaga,
  FRAME_TWEEN_MS,
} from '../../../src/state/camera/watchOrientationChangeSaga';
import { requestOrientationChange } from '../../../src/state/camera/orientationActions';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { ORIENTATION_FRAME_QUATERNIONS } from '../../../src/data/orientation/orientationFrames';
import { cameraRoute, settingsRoute } from '../../../src/store/constants';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { Vec4 } from '../../../src/@types/math/Vec4';
import type { LiveCameraRuntime } from '../../../src/store/types';

const flush = () => new Promise((r) => setTimeout(r, 0));

const FROM: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5 };

// A synthetic mid-slerp up-basis: an arbitrary UNIT quaternion that is not any of
// the four committed frame poles. This is the value a re-switch launched while a
// previous roll is still running must capture — the regression guard against the
// rejected committed-frame capture (which snapped the pole back before rolling).
const LIVE_QUAT: Vec4 = ((): Vec4 => {
  const q: Vec4 = [0.2, 0.3, 0.4, 0.5];
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
})();

describe('watchOrientationChangeSaga', () => {
  let store: ReturnType<typeof build>;
  let cameraRuntime: () => LiveCameraRuntime | null;

  function build() {
    const middleware = createSagaMiddleware();
    const created = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(middleware),
    });
    middleware.run(watchOrientationChangeSaga);
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, frameBasisQuat: LIVE_QUAT });
    middleware.setContext({ cameraRuntime: () => cameraRuntime() });
    return created;
  }
  beforeEach(() => {
    store = build();
  });

  it('requestOrientationChange dispatches setOrientation then startFrameTween to the target', async () => {
    store.dispatch(requestOrientationChange('galactic'));
    await flush();

    expect(store.getState()[settingsRoute].orientation).toBe('galactic');
    const frameTween = store.getState()[cameraRoute].frameTween;
    expect(frameTween).not.toBeNull();
    expect(frameTween!.to).toBe('galactic');
    expect(frameTween!.durationMs).toBe(FRAME_TWEEN_MS);
    expect(frameTween!.easing).toBe('inOut');
  });

  it('requestOrientationChange mid-slerp captures the live basis, not the committed frame', async () => {
    // The live basis is a synthetic mid-slerp quat, distinct from every committed
    // frame pole. The roll must seed from THAT, not from the target frame's quat.
    for (const committed of Object.values(ORIENTATION_FRAME_QUATERNIONS)) {
      expect(LIVE_QUAT).not.toEqual(committed);
    }

    store.dispatch(requestOrientationChange('galactic'));
    await flush();

    const frameTween = store.getState()[cameraRoute].frameTween;
    expect(frameTween!.fromQuat).toEqual(LIVE_QUAT);
    expect(frameTween!.fromQuat).not.toEqual(ORIENTATION_FRAME_QUATERNIONS.galactic);
  });

  it('a boot setOrientation never starts a frameTween', async () => {
    // The URL/boot path dispatches `setOrientation` directly (a snap), NOT
    // `requestOrientationChange`. The saga watches only the interactive intent,
    // so a boot snap must leave `frameTween` null — this is the structural
    // guarantee that a shared link or the first paint reproduces the frame with
    // no roll on arrival. If the saga ever grew a `setOrientation` watcher, a
    // deep-link load would slerp on boot; this pins that it cannot.
    store.dispatch(setOrientation('galactic'));
    await flush();

    expect(store.getState()[settingsRoute].orientation).toBe('galactic');
    expect(store.getState()[cameraRoute].frameTween).toBeNull();
  });

  it('a null cameraRuntime snaps via setOrientation with no frameTween', async () => {
    cameraRuntime = () => null;
    store.dispatch(requestOrientationChange('ecliptic'));
    await flush();

    expect(store.getState()[settingsRoute].orientation).toBe('ecliptic');
    expect(store.getState()[cameraRoute].frameTween).toBeNull();
  });
});
