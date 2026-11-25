/**
 * watchRequestFocusSaga — the deep-link / palette fly command: resolves the id
 * (waiting while pending) and writes the focus, which the rows reconciler then
 * fills. An absent id retires the request with no ref write. A body focused while absent may
 * then move the clock (`clockToFocusInstantSaga`), after the focus so a cold link's framing never
 * waits on a track. takeLatest drops a stale wait; the select twin is watchRequestSelectSaga.
 */
import { takeLatest, put, select, call } from 'typed-redux-saga';

import { requestFocus } from './requestFocus';
import { requestRetired, updateSelectionFocus } from './selectionSlice';
import { selectPendingFocusId } from './selectors';
import { resolveFocusRefDeferringSaga } from './resolveFocusRefDeferringSaga';
import { clockToFocusInstantSaga } from './clockToFocusInstantSaga';

export function* watchRequestFocusSaga() {
  yield* takeLatest(requestFocus, function* (action) {
    const ref = yield* resolveFocusRefDeferringSaga(action.payload.id);
    // Retired while waiting (a failed arrival, a cleared selection): don't land.
    if ((yield* select(selectPendingFocusId)) !== action.payload.id) return;
    if (ref === null) {
      yield* put(requestRetired({ slot: 'focus' }));
      return;
    }
    yield* put(updateSelectionFocus(ref, action.payload.transition));
    yield* call(clockToFocusInstantSaga, ref);
  });
}
