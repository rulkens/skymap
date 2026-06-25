/**
 * watchBiasBakeSaga — re-compute the galaxy brightness bias LUT whenever the
 * active BiasMode changes. The bake is synchronous on the engine side; the
 * saga simply forwards the new mode value.
 *
 * The worker reaches the engine via getContext — the ReconcileEffects closure
 * registered by the engine after construction. This keeps the store layer free
 * of engine imports while still letting the saga trigger the bake effect.
 */

import { takeEvery, getContext } from 'typed-redux-saga';

import { setBiasMode } from '../../state/settings/settingsSlice';
import type { ReconcileEffects } from './ReconcileEffects';

export function* watchBiasBakeSaga() {
  yield* takeEvery(setBiasMode, function* (a) {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.bakeBias(a.payload);
  });
}
