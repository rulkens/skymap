/**
 * watchOrientationChangeSaga — the two effects of an orientation switch:
 * persist the frame, then roll the up-basis toward it. Re-expressing
 * `camera.base` is the LOOP's job now (`stepCameraRuntime`, on the frame it
 * sees `settings.orientation` differ) — the saga fires before `wireInput`
 * seeds the camera on some paths, where a direct commit here would be lost.
 */
import { takeLatest, getContext, put } from 'typed-redux-saga';

import { requestOrientationChange } from './orientationActions';
import { startFrameTween } from './cameraSlice';
import { setOrientation } from '../settings/core/orientationSlice';
import type { SagaContext } from '../../store/types';

// Frame-roll duration (~1 s, spec §8); co-located since only this saga uses it.
export const FRAME_TWEEN_MS = 1000;

export function* watchOrientationChangeSaga() {
  yield* takeLatest(requestOrientationChange, function* (action) {
    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const frame = action.payload;

    yield* put(setOrientation(frame));

    // Pre-bootstrap/post-destroy, the frame already landed and there is no
    // live pole to roll from.
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
