/**
 * watchGoHomeSaga — flies the camera to the canonical sunlit Earth pose on each
 * `goHome` command, and pins Earth in the select + focus slots. The one home
 * intent behind the `h`/`e` keys and the Home pill lands here.
 *
 * ### Why home breaks the orientation-preserving rule
 *
 * Every OTHER focus (a palette body pick, the `f` key) preserves the user's
 * live yaw/pitch — the camera glides to the target from wherever it already
 * looks. Home is the ONE deliberate exception: it tweens to `earthHomePose`,
 * whose yaw/pitch aim at Earth's sunlit side with the terminator raking across
 * the globe. Landing on the night side (a black disc) would waste the "you are
 * here" arrival shot, so home overrides orientation on purpose.
 *
 * ### Why this tween is the only camera authority during the flight
 *
 * `watchFocusTweenSaga` deliberately NO-OPS for bodies the follow driver handles
 * (see watchFocusTweenSaga.ts:85-97 — 'followed, not tweened'), so writing the
 * Earth focus row here plants no competing tween. This saga's `startCameraTween`
 * is the sole mover. On tween end the follow driver activates, captures the
 * tween's end pose as its `from`, and re-seeds its distance target to the exact
 * framing distance the pose already carries (`followElapsed` in cameraClock.ts
 * nulls `followDistanceTarget` on every focus-row change; the driver re-seeds it
 * to `bodyLikeFraming`'s distance — the same one `earthHomePose` used). Because
 * the pose already sits at that distance, the tween→follow handoff is seamless:
 * the driver takes over a camera already at rest.
 *
 * ### Why BOTH select and focus are written
 *
 * `updateSelectionSelect(EARTH_REF)` pins the InfoCard (the "you are here"
 * onboarding card); `updateSelectionFocus(EARTH_REF)` drives the follow-pivot
 * (`applyFocusedBodyPivot`) and the URL hash. The `h`-key path before this fold
 * wrote only focus, so the card never pinned — writing both closes that gap and
 * matches the palette path.
 *
 * ### Why it bails, and why getContext is read INSIDE the loop
 *
 * `cameraRuntime()` is null pre-bootstrap / post-destroy (mirroring
 * watchFocusTweenSaga's null-runtime bail): a home press in that window simply
 * does nothing rather than tweening from a stale pose. getContext is read per
 * action, not once at saga start, because the engine registers its saga context
 * AFTER the root saga forks — the same reason the sibling sagas read it lazily.
 */
import { take, getContext, put, select } from 'typed-redux-saga';

import { goHome } from './goHome';
import { EARTH_REF } from '../../data/selection/earthRef';
import { updateSelectionSelect, updateSelectionFocus } from './selectionSlice';
import { startCameraTween } from '../camera/cameraSlice';
import { earthHomePose } from '../../services/engine/camera/earthHomePose';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { selectOrientation } from '../settings/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { FOCUS_TWEEN_MS } from '../../services/engine/camera/focusTweenDuration';
import type { RootState, SagaContext } from '../../store/types';

export function* watchGoHomeSaga() {
  while (true) {
    yield* take(goHome);

    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const runtime = cameraRuntime();
    if (runtime === null) continue;

    // Home framing comes from the LIVE sim instant, derived canonically from the
    // time-intent slice (`deriveSimDays(state.time, now)` — the same derivation
    // `runFrame` performs each frame), so home lands where Earth IS now.
    const time = yield* select((state: RootState) => state.time);
    const simDays = deriveSimDays(time, performance.now());

    // The steady committed orientation basis, so the home pose encodes its aim
    // through the same frame the render path decodes with (see `earthHomePose`).
    // The bare id is also stamped onto the descriptor (`frame`) so the tween
    // driver can re-express the pose if the setting changes mid-flight.
    const frame = yield* select(selectOrientation);
    const frameBasis = ORIENTATION_FRAMES[frame];

    yield* put(updateSelectionSelect(EARTH_REF));
    yield* put(updateSelectionFocus(EARTH_REF));
    yield* put(
      startCameraTween({
        from: runtime.from,
        to: earthHomePose(simDays, runtime.fovYRad, frameBasis),
        durationMs: FOCUS_TWEEN_MS,
        easing: 'easeOutCubic',
        frame,
      }),
    );
  }
}
