/**
 * watchSelectionWakeSaga — render-on-demand for selection. A select, focus, or
 * clear write has a GPU consequence (the selection ring, the member-isolation
 * fade — appearing OR disappearing), so it wakes the loop via requestRender.
 * getContext is read INSIDE the worker (per-action), like the other reconcile
 * watchers, because the engine registers the reconcile bag AFTER the root saga
 * is forked.
 *
 * Hover wakes only when the previous or the new hover is of a kind that may
 * carry a label or ring (`mayHaveLabel`): the label whitens, the ring
 * brightens. Hover lands at pointer-pick rate, so sweeping survey stars and
 * galaxies (InfoCard text only) must not start frames. The previous hover is
 * tracked here because the reducer has already overwritten it.
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
import type { PayloadAction } from '@reduxjs/toolkit';

import {
  updateSelectionSelect,
  updateSelectionFocus,
  updateSelectionHover,
  clearSelection,
} from './selectionSlice';
import { shallowEqualRef } from '../../utils/object/shallowEqualRef';
import { mayHaveLabel } from '../../utils/selection/mayHaveLabel';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

export function* watchSelectionWakeSaga() {
  yield* takeEvery([updateSelectionSelect, updateSelectionFocus, clearSelection], function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });

  let hovered: SelectionRef | null = null;
  yield* takeEvery(updateSelectionHover, function* (action: PayloadAction<SelectionRef | null>) {
    const previous = hovered;
    hovered = action.payload;
    if (shallowEqualRef(previous, hovered)) return;
    if (!mayHaveLabel(previous) && !mayHaveLabel(hovered)) return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
