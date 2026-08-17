/**
 * watchLogCameraStateSaga — handles the reducer-less `logCameraState` command by
 * calling the engine's pose-printing effect. Its own saga, not folded into the
 * keyboard drain, because the command is surface-agnostic: the `l` key dispatches
 * it today, but any debug affordance could. getContext is read PER ACTION, inside
 * the worker — not once at fork — because the engine registers its saga context
 * AFTER the root saga forks (the same reason watchGoHomeSaga reads cameraRuntime
 * lazily).
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { logCameraState } from './logCameraState';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';

export function* watchLogCameraStateSaga() {
  yield* takeEvery(logCameraState, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.logCameraState();
  });
}
