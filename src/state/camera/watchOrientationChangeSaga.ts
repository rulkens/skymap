/**
 * watchOrientationChangeSaga — the three effects of an orientation switch.
 *
 * `requestOrientationChange(frame)` becomes: persist the frame
 * (`setOrientation`), re-express `camera.base` into it so the eye holds still
 * the instant `poseBasis` flips (`commitCameraPose` + `reencodePose`), then
 * roll the up-basis toward it (`startFrameTween`). The re-encode's `from` and
 * the roll's `fromQuat` deliberately read DIFFERENT bases: `from` is the
 * OUTGOING REGISTRY frame (`poseBasis` never mid-slerps, so that's what
 * `base`'s angles are valid in); `fromQuat` is the LIVE up-basis. Do not unify.
 */
import { takeLatest, getContext, put, select } from 'typed-redux-saga';

import { requestOrientationChange } from './orientationActions';
import { startFrameTween, commitCameraPose } from './cameraSlice';
import { selectCameraBase } from './selectors';
import { setOrientation } from '../settings/settingsSlice';
import { selectOrientation } from '../settings/selectors';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { reencodePose } from '../../utils/camera/reencodePose';
import { absoluteArm } from '../../utils/camera/absoluteArm';
import type { SagaContext } from '../../store/types';

// Frame-roll duration (~1 s, spec §8); co-located since only this saga uses it.
export const FRAME_TWEEN_MS = 1000;

export function* watchOrientationChangeSaga() {
  yield* takeLatest(requestOrientationChange, function* (action) {
    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const frame = action.payload;

    // Read the OUTGOING frame and pose before either write below lands — `base`'s
    // (yaw, pitch) are angles in this basis, never a mid-slerp one (see header).
    const previous = yield* select(selectOrientation);
    const base = yield* select(selectCameraBase);

    yield* put(setOrientation(frame));
    // World arm only: a body arm's pose is stored in the body's own axes, so no
    // (yaw, pitch) is expressed against the pole that just moved.
    if (base.frame === 'absolute') {
      yield* put(
        commitCameraPose(
          absoluteArm(
            reencodePose(base.pose, ORIENTATION_FRAMES[previous], ORIENTATION_FRAMES[frame]),
          ),
        ),
      );
    }

    // The re-encode above needs no camera (pure store + registry); only the
    // roll does. Pre-bootstrap/post-destroy, the frame and pose already landed.
    const runtime = cameraRuntime();
    if (runtime === null) return;

    yield* put(
      startFrameTween({
        fromQuat: runtime.upBasisQuat,
        to: frame,
        durationMs: FRAME_TWEEN_MS,
        easing: 'easeInOutCubic',
      }),
    );
  });
}
