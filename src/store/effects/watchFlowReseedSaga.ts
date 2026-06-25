/**
 * watchFlowReseedSaga — reseed the cosmic-flow particle field when the user
 * changes the particle count or flow mode. Patch-only writes (e.g. enabled
 * toggle) skip the reseed: reseeding is only required when the particle
 * population or its generation parameters change.
 *
 * The worker reaches the engine via getContext — the ReconcileEffects closure
 * registered by the engine after construction. This keeps the store layer free
 * of engine imports while still letting the saga trigger the reseed effect.
 */

import { takeEvery, getContext } from 'typed-redux-saga';

import { setFlow } from '../../state/settings/settingsSlice';
import type { ReconcileEffects } from './ReconcileEffects';

export function* watchFlowReseedSaga() {
  yield* takeEvery(setFlow, function* (a) {
    if (a.payload.mode === undefined && a.payload.count === undefined) return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.reseedFlow();
  });
}
