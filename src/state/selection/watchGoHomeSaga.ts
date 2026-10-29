/**
 * watchGoHomeSaga — flies the camera to the canonical sunlit Earth pose on each
 * `goHome` command (the `h`/`e` keys and the Home pill).
 *
 * Home deliberately overrides the live orientation: it lands on `bodyHomePose`'s
 * sunlit side, not a night-side disc. The focus is written as `'cut'` so
 * `watchFocusTweenSaga` plants no competing tween; this tween is the sole mover
 * and the follow memory settles on arrival. Both select (InfoCard pin) and focus
 * (follow pivot, URL) are written. On a null `cameraRuntime` the press is
 * skipped; getContext is read per action because the engine registers its
 * context after the root saga forks.
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
