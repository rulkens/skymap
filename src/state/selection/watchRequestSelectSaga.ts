/**
 * watchRequestSelectSaga — the palette / deep-link PIN command handler.
 * requestSelect carries a durable focus id; this resolves it to a ref via the
 * shared resolveFocusRefDeferringSaga loop (deferring on both catalog-commit pulses
 * while unresolvable), then dispatches updateSelectionSelect(ref) so the InfoCard
 * pins. takeLatest aborts a stale deferral if a newer requestSelect arrives. Its
 * sibling watchRequestFocusSaga writes the focus slot off the same shared loop.
 */
import { takeLatest, put, select } from 'typed-redux-saga';

import { requestSelect } from './requestSelect';
import { updateSelectionSelect } from './selectionSlice';
import { selectPendingSelectId } from './selectors';
import { resolveFocusRefDeferringSaga } from './resolveFocusRefDeferringSaga';

export function* watchRequestSelectSaga() {
  yield* takeLatest(requestSelect, function* (action) {
    const ref = yield* resolveFocusRefDeferringSaga(action.payload);
    // Retired while deferring: see watchRequestFocusSaga.
    if ((yield* select(selectPendingSelectId)) !== action.payload) return;
    yield* put(updateSelectionSelect(ref));
  });
}
