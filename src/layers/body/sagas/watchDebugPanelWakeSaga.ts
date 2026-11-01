/**
 * watchDebugPanelWakeSaga — opening the DebugPanel wakes a frame, because the tile
 * readouts are published only from inside one: with the clock paused the loop sleeps,
 * and the panel would show its last (or the seeded empty) readout until an unrelated
 * wake. Closing has nothing to publish, so it stays silent.
 */
import { takeEvery, getContext, select } from 'typed-redux-saga';

import { setDebugPanelOpen, toggleDebugPanelOpen } from '../../../state/ui/uiSlice';
import { selectDebugPanelOpen } from '../../../state/ui/selectors';
import type { ReconcileEffects } from '../../../store/effects/ReconcileEffects';

export function* watchDebugPanelWakeSaga() {
  yield* takeEvery([setDebugPanelOpen, toggleDebugPanelOpen], function* () {
    if (!(yield* select(selectDebugPanelOpen))) return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
