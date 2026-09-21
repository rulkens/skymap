/**
 * watchLogCameraStateSaga — handles the reducer-less `logCameraState` command
 * by calling the engine's pose-printing effect, then logs the share URL
 * `shareUrlFor` composes from it. getContext is read PER ACTION, inside the
 * worker — not once at fork — because the engine registers its saga context
 * AFTER the root saga forks (the same reason watchGoHomeSaga reads
 * cameraRuntime lazily).
 */
import { takeEvery, getContext, select } from 'typed-redux-saga';

import { logCameraState } from './logCameraState';
import { shareUrlFor } from '../url/shareUrlFor';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';
import type { RootState } from '../../store/types';

export function* watchLogCameraStateSaga() {
  yield* takeEvery(logCameraState, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    const dump = fx.logCameraState();
    if (dump === null) return;

    const state = yield* select((s: RootState) => s);
    if (typeof location === 'undefined') return;
    console.log('[engine] share URL:', shareUrlFor(state, dump.framed, dump.simDays, location));
  });
}
