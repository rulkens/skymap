/**
 * watchPaletteWakeSaga — render-on-demand for the command palette. Opening
 * the palette IS the pgcAlias row's demand trigger (`galaxyCatalogAssetRows.ts`
 * demands on `ctx.ui.paletteOpen`), but the demand loop only runs inside a
 * frame — with render-on-demand at rest, no frame ever runs to notice the
 * flag flipped, so the alias load would never start. This wakes the loop on
 * open only; closing has no load to trigger, so it stays silent.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { setPaletteOpen } from './uiSlice';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';

export function* watchPaletteWakeSaga() {
  yield* takeEvery(setPaletteOpen, function* (action) {
    if (!action.payload) return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
