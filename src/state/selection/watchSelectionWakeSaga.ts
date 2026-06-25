/**
 * watchSelectionWakeSaga — render-on-demand for selection. A select, focus, or
 * clear write has a GPU consequence (the selection ring, the member-isolation
 * fade — appearing OR disappearing), so it wakes the loop via requestRender.
 * Hover has NO GPU consequence — it only feeds the React InfoCard — so it is
 * deliberately absent. getContext is read INSIDE the worker (per-action), like
 * the other reconcile watchers, because the engine registers the reconcile bag
 * AFTER the root saga is forked.
 *
 * Every action that changes a GPU-visible selection ref MUST appear here, or
 * its frame never redraws: clearSelection (Esc / InfoCard ×) drops the ring,
 * and without a wake the last frame keeps painting it.
 *
 * A no-op re-select still dispatches the action (the reducer no-ops the STATE,
 * not the action), so requestRender fires once; it is idempotent and coalesced
 * into one rAF — accepted as the cost of the uniform saga vehicle.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { updateSelectionSelect, updateSelectionFocus, clearSelection } from './selectionSlice';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';

export function* watchSelectionWakeSaga() {
  yield* takeEvery([updateSelectionSelect, updateSelectionFocus, clearSelection], function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
