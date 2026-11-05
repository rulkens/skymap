/**
 * watchInputWakeSaga — wakes the loop for gesture start, motion and end only.
 * `inputConsumed` must never wake: the frame dispatches it, so the loop would
 * never stop. getContext is read per action: the reconcile bag registers after
 * the root saga forks.
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
