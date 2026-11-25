/**
 * watchRequestFocusSaga — the deep-link / palette fly command: resolves the id
 * (waiting while pending) and writes the focus, which the rows reconciler then
 * fills. An absent id retires the request with no ref write. takeLatest drops a
 * stale wait; the select twin is watchRequestSelectSaga.
 */
import { takeLatest, put, select } from 'typed-redux-saga';

import { requestFocus } from './requestFocus';
import { requestRetired, updateSelectionFocus } from './selectionSlice';
import { selectPendingFocusId } from './selectors';
import { resolveFocusRefDeferringSaga } from './resolveFocusRefDeferringSaga';

export function* watchRequestFocusSaga() {
  yield* takeLatest(requestFocus, function* (action) {
    const ref = yield* resolveFocusRefDeferringSaga(action.payload.id);
    // Retired while waiting (a failed arrival, a cleared selection): don't land.
    if ((yield* select(selectPendingFocusId)) !== action.payload.id) return;
    yield* put(
      ref === null
        ? requestRetired({ slot: 'focus' })
        : updateSelectionFocus(ref, action.payload.transition),
    );
  });
}
