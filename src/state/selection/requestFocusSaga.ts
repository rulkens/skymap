/**
 * watchRequestFocus — the deep-link / palette command handler. requestFocus
 * carries a durable focus id; this resolves it to a ref via resolveFocusId,
 * DEFERRING on catalogLoaded while the id is unresolvable (the cloud for a deep
 * link, or a tier galaxy still fetching). Once resolved it dispatches
 * updateSelectionFocus(ref); the watchSelectionRows reconciler then fills the
 * row off that write. takeLatest aborts a stale deferral if a newer requestFocus
 * arrives. This is the single command->ref bridge; React never resolves ids.
 */
import { takeLatest, take, put, getContext } from 'typed-redux-saga';

import { requestFocus } from './requestFocus';
import { updateSelectionFocus } from './selectionSlice';
import { catalogLoaded } from '../catalog/catalogLoaded';
import { resolveFocusId } from '../../services/url/resolveFocusId';
import type { SagaContext } from '../../store/types';

export function* watchRequestFocus() {
  yield* takeLatest(requestFocus, function* (action) {
    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
    let ref = resolveFocusId(action.payload, resolveDeps());
    while (!ref) {
      yield* take(catalogLoaded);
      ref = resolveFocusId(action.payload, resolveDeps());
    }
    yield* put(updateSelectionFocus(ref));
  });
}
