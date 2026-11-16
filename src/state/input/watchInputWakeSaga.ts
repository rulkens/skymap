/**
 * watchInputWakeSaga — wakes the loop for gesture start, motion, end and a lift-off only.
 * `inputConsumed` must never wake: the frame dispatches it, so the loop would
 * never stop. getContext is read per action: the reconcile bag registers after
 * the root saga forks.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import {
  inputGestureStarted,
  inputMoved,
  inputGestureEnded,
  inputLiftOffRequested,
} from './inputSlice';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';

export function* watchInputWakeSaga() {
  const wakes = [inputGestureStarted, inputMoved, inputGestureEnded, inputLiftOffRequested];
  yield* takeEvery(wakes, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
