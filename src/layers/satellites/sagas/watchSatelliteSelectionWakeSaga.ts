/**
 * watchSatelliteSelectionWakeSaga — selecting or focusing a satellite wakes a frame, so the demand
 * loop (idle at rest) sees `satellitesAssetRows`'s selection arm flip and loads the catalog. A
 * deep link to a satellite waits on exactly that; dropping a satellite has nothing to trigger.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../state/selection/selectionSlice';
import type { ReconcileEffects } from '../../../store/effects/ReconcileEffects';

export function* watchSatelliteSelectionWakeSaga() {
  yield* takeEvery([updateSelectionFocus, updateSelectionSelect], function* (action) {
    if (action.payload?.type !== 'satellite') return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
