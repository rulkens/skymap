/**
 * watchOrientationChangeSaga — the two-effect EFFECT of an orientation switch.
 *
 * `requestOrientationChange(frame)` is an Intent: "make this the up pole". The
 * saga translates it into the two writes a switch needs — persist the target
 * frame (`setOrientation`) and start the up-basis roll toward it
 * (`startFrameTween`) — so a control only names a frame and never touches either
 * slice. This mirrors `watchFocusTweenSaga`: a `takeLatest` worker reads the live
 * camera resource from saga context, builds the payload, and dispatches.
 *
 * The roll's start quaternion is the crux. It must be the LIVE up-basis resolved
 * this frame (`cameraRuntime().frameBasisQuat`), NOT the committed frame's pole:
 * during a slerp the resolved basis sits between two frames, so capturing the
 * committed pole would snap the up-vector back before rolling to the new target —
 * visible jank on a rapid re-switch. Reading the live basis instead lets a
 * mid-slerp switch compose continuously from wherever the pole is right now.
 *
 * A null runtime (pre-bootstrap / post-destroy) has nothing to animate, so the
 * switch degrades to a snap: `setOrientation` alone, matching the focus saga's
 * null-runtime bail. `getContext` is read INSIDE the worker because the engine
 * registers the saga context AFTER the root saga forks. `takeLatest` is the idiom
 * — a newer switch supersedes a waiting worker — so no raw `while (true)` watcher
 * loop is needed.
 */
import { takeLatest, getContext, put } from 'typed-redux-saga';

import { requestOrientationChange } from './orientationActions';
import { startFrameTween } from './cameraSlice';
import { setOrientation } from '../settings/settingsSlice';
import type { SagaContext } from '../../store/types';

// Frame-roll duration (~1 s, spec §8). Co-located with the saga because the saga
// is the sole author of the `startFrameTween` payload; nothing else needs it.
export const FRAME_TWEEN_MS = 1000;

export function* watchOrientationChangeSaga() {
  yield* takeLatest(requestOrientationChange, function* (action) {
    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const frame = action.payload;

    // Persist the target frame first — this write stands whether or not there is
    // a camera to animate, so the snap and the animated paths share it.
    yield* put(setOrientation(frame));

    // Nothing to roll before the camera exists (or after it's torn down): the
    // frame is already committed, so a snap is the right degenerate behaviour.
    const runtime = cameraRuntime();
    if (runtime === null) return;

    // Seed the roll from the LIVE up-basis (this frame's resolved pole), so a
    // re-switch mid-slerp composes continuously rather than snapping back.
    yield* put(
      startFrameTween({
        fromQuat: runtime.frameBasisQuat,
        to: frame,
        durationMs: FRAME_TWEEN_MS,
        easing: 'easeInOutCubic',
      }),
    );
  });
}
