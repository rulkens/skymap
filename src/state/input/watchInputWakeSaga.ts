/**
 * watchInputWakeSaga — render-on-demand for held input: a gesture start, its
 * motion and its end each have a camera consequence the next frame must draw.
 *
 * Hover, tap and the pick answers stay wake-free (hover lands at pointer rate;
 * the selection they lead to wakes through its own saga), and `inputConsumed`
 * must never wake: the frame dispatches it, so waking on it would keep the loop
 * alive forever. getContext is read per action because the engine registers the
 * reconcile bag after the root saga is forked.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { inputGestureStarted, inputMoved, inputGestureEnded } from './inputSlice';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';

export function* watchInputWakeSaga() {
  yield* takeEvery([inputGestureStarted, inputMoved, inputGestureEnded], function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
