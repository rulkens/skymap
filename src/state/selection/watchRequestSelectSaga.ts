/**
 * watchRequestSelectSaga — the palette / deep-link pin command; the select twin
 * of watchRequestFocusSaga.
 */
import { takeLatest, put, select } from 'typed-redux-saga';

import { requestSelect } from './requestSelect';
import { requestRetired, updateSelectionSelect } from './selectionSlice';
import { selectPendingSelectId } from './selectors';
import { resolveFocusRefDeferringSaga } from './resolveFocusRefDeferringSaga';

export function* watchRequestSelectSaga() {
  yield* takeLatest(requestSelect, function* (action) {
    const ref = yield* resolveFocusRefDeferringSaga(action.payload);
    // Retired while deferring: see watchRequestFocusSaga.
    if ((yield* select(selectPendingSelectId)) !== action.payload) return;
    yield* put(ref === null ? requestRetired({ slot: 'select' }) : updateSelectionSelect(ref));
  });
}
