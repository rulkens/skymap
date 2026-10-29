/**
 * watchGoHomeSaga — flies the camera to the canonical sunlit Earth pose on each
 * `goHome` command, and pins Earth in the select + focus slots. The one home
 * intent behind the `h`/`e` keys and the Home pill lands here.
 *
 * ### Why home breaks the orientation-preserving rule
 *
 * Every OTHER focus (a palette body pick, the `f` key) preserves the user's
 * live yaw/pitch — the camera glides to the target from wherever it already
 * looks. Home is the ONE deliberate exception: it tweens to `bodyHomePose`,
 * whose yaw/pitch aim at Earth's sunlit side with the terminator raking across
 * the globe. Landing on the night side (a black disc) would waste the "you are
 * here" arrival shot, so home overrides orientation on purpose.
 *
 * ### Why this tween is the only camera authority during the flight
 *
 * The Earth focus is written as a `'cut'`, so `watchFocusTweenSaga` plants no
 * competing tween (under Geodesic it would fly Earth's heading-keeping framing);
 * this saga's `startCameraTween` is the sole mover, in the user's focus-move
 * style. The tween delivers the framing, so the follow memory it hands over is
 * settled: on tween end the follow row holds Earth at the landed distance with
 * no second ease. A Geodesic flight runs up to the tuning's max duration while
 * Earth moves under a pose frozen at dispatch: invisible at real time, a
 * visible catch-up on the hand-off frame at fast rates.
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
import { bodyHomePose } from '../../services/engine/camera/bodyHomePose';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { selectFocusMoves, selectOrientation } from '../settings/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { resolveFocusMotion } from '../../utils/camera/resolveFocusMotion';
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
    // through the same frame the render path decodes with (see `bodyHomePose`).
    // The bare id is also stamped onto the descriptor (`frame`) so the tween
    // driver can re-express the pose if the setting changes mid-flight.
    const frame = yield* select(selectOrientation);
    const frameBasis = ORIENTATION_FRAMES[frame];
    const motion = resolveFocusMotion(yield* select(selectFocusMoves), runtime.fovYRad);

    yield* put(updateSelectionSelect(EARTH_REF));
    yield* put(updateSelectionFocus(EARTH_REF, 'cut'));
    yield* put(
      startCameraTween({
        from: runtime.from,
        to: bodyHomePose(EARTH_REF.id, simDays, runtime.fovYRad, frameBasis),
        motion,
        frame,
      }),
    );
  }
}
