/**
 * watchPaletteWakeSaga — opening the command palette wakes a frame so the
 * demand loop (idle at rest) notices `pgcAlias`'s demand flip; closing has
 * nothing to trigger, so it stays silent.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { setPaletteOpen } from '../../../state/ui/uiSlice';
import type { ReconcileEffects } from '../../../store/effects/ReconcileEffects';

export function* watchPaletteWakeSaga() {
  yield* takeEvery(setPaletteOpen, function* (action) {
    if (!action.payload) return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
