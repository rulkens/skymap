/**
 * watchFocusTween — the camera-tween EFFECT. A focus gesture writes the focus
 * ref (updateSelectionFocus); the camera flying to the target is an effect of
 * that Intent, so it lives here as a saga — symmetric with watchSelectionWake
 * (render-wake) and tierSaga's runTierTransition. It calls the engine-injected
 * runFocusTween runner via SagaContext; the runner resolves the ref's coords
 * from the live cloud and runs the existing tweens. Firing on the REF (not the
 * reconciled row) keeps the tween a response to the Intent and free of any
 * dependence on watchSelectionRows running first.
 *
 * getContext is read INSIDE the worker (per-action), like watchSelectionWake and
 * tierSaga, because the engine registers runFocusTween AFTER the root saga forks.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { updateSelectionFocus } from './selectionSlice';
import type { SagaContext } from '../../store/types';

export function* watchFocusTween() {
  yield* takeEvery(updateSelectionFocus, function* (action) {
    const runFocusTween = yield* getContext<SagaContext['runFocusTween']>('runFocusTween');
    runFocusTween(action.payload);
  });
}
