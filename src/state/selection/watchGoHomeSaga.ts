/**
 * watchGoHomeSaga — flies the camera to the composition's home pose on each
 * `goHome` command (the `h`/`e` keys and the Home pill).
 *
 * Home deliberately overrides the live orientation: a body home lands on
 * `bodyHomePose`'s sunlit side, not a night-side disc. The focus is written as
 * `'cut'` so `watchFocusTweenSaga` plants no competing tween; this tween is the
 * sole mover and the follow memory settles on arrival. On a null `cameraRuntime`
 * the press is skipped; getContext is read per action because the engine
 * registers its context after the root saga forks.
 */
import { take, getContext, put, select } from 'typed-redux-saga';

import { goHome } from './goHome';
import { clearSelection, updateSelectionSelect, updateSelectionFocus } from './selectionSlice';
import { startCameraTween } from '../camera/cameraIntentSlice';
import { homePose } from '../../services/engine/camera/framing/homePose';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { selectFocusMoves, selectOrientation } from '../settings/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { resolveFocusMotion } from '../../utils/camera/focusMotion/resolveFocusMotion';
import type { RootState, SagaContext } from '../../store/types';

export function* watchGoHomeSaga() {
  while (true) {
    yield* take(goHome);

    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const runtime = cameraRuntime();
    if (runtime === null) continue;
    const home = yield* getContext<SagaContext['home']>('home');

    // Home framing comes from the LIVE sim instant, derived canonically from the
    // time-intent slice (`deriveSimDays(state.time, now)` — the same derivation
    // `runFrame` performs each frame), so home lands where its body IS now.
    const time = yield* select((state: RootState) => state.time);
    const simDays = deriveSimDays(time, performance.now());

    // The steady committed orientation basis, so the home pose encodes its aim
    // through the same frame the render path decodes with (see `homePose`).
    // The bare id is also stamped onto the descriptor (`frame`) so the tween
    // driver can re-express the pose if the setting changes mid-flight.
    const frame = yield* select(selectOrientation);
    const frameBasis = ORIENTATION_FRAMES[frame];
    const motion = resolveFocusMotion(yield* select(selectFocusMoves), runtime.fovYRad);

    if (home.focus === null) {
      yield* put(clearSelection());
    } else {
      if (home.seedSelection) yield* put(updateSelectionSelect(home.focus.ref));
      yield* put(updateSelectionFocus(home.focus.ref, 'cut'));
    }
    yield* put(
      startCameraTween({
        from: runtime.from,
        to: homePose(home, runtime.fovYRad, simDays, frameBasis).pose,
        motion,
        frame,
      }),
    );
  }
}
