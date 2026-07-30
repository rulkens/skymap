/**
 * watchRequestSelectSaga — the palette / deep-link PIN command handler.
 * requestSelect carries a durable focus id; this resolves it to a ref via the
 * shared resolveFocusRefDeferring loop (deferring on both catalog-commit pulses
 * while unresolvable), then dispatches updateSelectionSelect(ref) so the InfoCard
 * pins. takeLatest aborts a stale deferral if a newer requestSelect arrives. Its
 * sibling watchRequestFocusSaga writes the focus slot off the same shared loop.
 */
import { takeLatest, put } from 'typed-redux-saga';

import { requestSelect } from './requestSelect';
import { updateSelectionSelect } from './selectionSlice';
import { resolveFocusRefDeferring } from './resolveFocusRefDeferring';

export function* watchRequestSelectSaga() {
  yield* takeLatest(requestSelect, function* (action) {
    const ref = yield* resolveFocusRefDeferring(action.payload);
    yield* put(updateSelectionSelect(ref));
  });
}
