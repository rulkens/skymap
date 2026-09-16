/**
 * watchPaletteWakeSaga — opening the palette is the pgcAlias row's demand
 * trigger (`galaxyCatalogAssetRows.ts` demands on `ctx.ui.paletteOpen`), but
 * the demand loop only runs inside a frame: at rest, no frame runs to notice
 * the flag flip, so the alias load never starts without this wake. Closing
 * has no load to trigger, so it stays silent.
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
