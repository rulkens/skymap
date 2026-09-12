import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import {
  watchOrientationChangeSaga,
  FRAME_TWEEN_MS,
} from '../../../src/state/camera/watchOrientationChangeSaga';
import { requestOrientationChange } from '../../../src/state/camera/orientationActions';
import { commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import {
  ORIENTATION_FRAMES,
  ORIENTATION_FRAME_QUATERNIONS,
} from '../../../src/data/orientation/orientationFrames';
import { yawPitchToDir } from '../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { mat3FromColumns } from '../../../src/utils/math/mat3FromColumns';
import { cameraRoute, settingsRoute } from '../../../src/store/constants';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { Vec4 } from '../../../src/@types/math/Vec4';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { LiveCameraRuntime } from '../../../src/store/types';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { worldArmOf } from '../../fixtures/worldArmOf';

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

// A stand-in for "the live up-basis mid-slerp", used ONLY to compute what a
// WRONG re-encode (one that reaches for the live basis instead of the outgoing
// registry frame) would have produced — never fed into the saga itself, since
// the fix reads `ORIENTATION_FRAMES[previous]`, not any live Mat3.
const LIVE_BASIS: Mat3 = mat3FromColumns([0, 1, 0], [0, 0, 1], [1, 0, 0]);

function worldEyeDir(pose: CameraPose, basis: Mat3): Vec3 {
  return rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), basis);
}

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
    cameraRuntime = () => ({ from: FROM, fovYRad: 0.8, upBasisQuat: LIVE_QUAT });
    middleware.setContext({ cameraRuntime: () => cameraRuntime() });
    return created;
  }
  beforeEach(() => {
    store = build();
  });

  const committedPose = (): CameraPose => worldArmOf(store.getState()[cameraRoute].base);

  it('requestOrientationChange dispatches setOrientation then startFrameTween to the target', async () => {
    store.dispatch(requestOrientationChange('galactic'));
    await flush();

    expect(store.getState()[settingsRoute].orientation).toBe('galactic');
    const frameTween = store.getState()[cameraRoute].frameTween;
    expect(frameTween).not.toBeNull();
    expect(frameTween!.to).toBe('galactic');
    expect(frameTween!.durationMs).toBe(FRAME_TWEEN_MS);
    expect(frameTween!.easing).toBe('easeInOutCubic');
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

  it('a steady switch commits a pose whose eye position is unchanged', async () => {
    const from: CameraPose = { target: [1, 2, 3], yaw: 0.4, pitch: -0.2, distance: 7 };
    store.dispatch(commitCameraPose(absoluteArm(from)));
    // Default orientation (see `initialState.ts`) is 'ecliptic' — no prior
    // switch, so this is the outgoing registry frame `base` actually lives in.
    const expectedDir = worldEyeDir(from, ORIENTATION_FRAMES.ecliptic);

    store.dispatch(requestOrientationChange('galactic'));
    await flush();

    const actualDir = worldEyeDir(committedPose(), ORIENTATION_FRAMES.galactic);
    expect(actualDir[0]).toBeCloseTo(expectedDir[0], 6);
    expect(actualDir[1]).toBeCloseTo(expectedDir[1], 6);
    expect(actualDir[2]).toBeCloseTo(expectedDir[2], 6);
  });

  it('a switch fired mid-roll re-expresses from the PREVIOUS committed frame, not the live up-basis', async () => {
    // First switch (ecliptic default -> galactic): steady, lands `base` in the
    // galactic basis and `settings.orientation` at 'galactic'.
    const from: CameraPose = { target: [0, 0, 0], yaw: 1.1, pitch: 0.3, distance: 2 };
    store.dispatch(commitCameraPose(absoluteArm(from)));
    store.dispatch(requestOrientationChange('galactic'));
    await flush();
    const afterFirstSwitch = committedPose();

    // Simulate the up-basis still mid-slerp toward galactic when a SECOND
    // switch fires: `cameraRuntime` reports a live basis that is neither the
    // now-committed frame (galactic) nor the next destination (supergalactic)
    // — the shape a real interrupted roll produces. This must NOT be what the
    // re-encode reads; if it were, the eye would jump (see task-6-report.md).
    expect(LIVE_BASIS).not.toEqual(ORIENTATION_FRAMES.galactic);
    expect(LIVE_BASIS).not.toEqual(ORIENTATION_FRAMES.supergalactic);
    cameraRuntime = () => ({ from: afterFirstSwitch, fovYRad: 0.8, upBasisQuat: LIVE_QUAT });

    const correctDir = worldEyeDir(afterFirstSwitch, ORIENTATION_FRAMES.galactic);
    const wrongDir = worldEyeDir(afterFirstSwitch, LIVE_BASIS);
    // Regression guard: the two candidate `from` bases must actually decode
    // differently, or this test can't tell a correct implementation (reads the
    // committed frame) from a wrong one (reads the live up-basis) below.
    const divergesFromLiveBasis =
      Math.abs(correctDir[0] - wrongDir[0]) > 1e-6 ||
      Math.abs(correctDir[1] - wrongDir[1]) > 1e-6 ||
      Math.abs(correctDir[2] - wrongDir[2]) > 1e-6;
    expect(divergesFromLiveBasis).toBe(true);

    store.dispatch(requestOrientationChange('supergalactic'));
    await flush();

    const actualDir = worldEyeDir(committedPose(), ORIENTATION_FRAMES.supergalactic);
    expect(actualDir[0]).toBeCloseTo(correctDir[0], 6);
    expect(actualDir[1]).toBeCloseTo(correctDir[1], 6);
    expect(actualDir[2]).toBeCloseTo(correctDir[2], 6);
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
