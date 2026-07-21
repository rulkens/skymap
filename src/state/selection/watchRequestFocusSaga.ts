/**
 * watchRequestFocusSaga — the deep-link / palette FLY command handler.
 * requestFocus carries a durable focus id; this resolves it to a ref via the
 * shared resolveFocusRefDeferring loop, which DEFERS while the id is unresolvable
 * on BOTH catalog-commit pulses — catalogLoaded (the galaxy cloud) AND
 * engineSourceCountReported (every source's count pulse, incl. the Gaia star bin,
 * which never fires catalogLoaded), so a star deep link resolves too. Once
 * resolved it dispatches updateSelectionFocus(ref); the watchSelectionRowsSaga
 * reconciler then fills the row off that write. takeLatest aborts a stale
 * deferral if a newer requestFocus arrives. Its sibling watchRequestSelectSaga
 * writes the select slot off the same shared loop; React never resolves ids.
 */
import { takeLatest, put } from 'typed-redux-saga';

import { requestFocus } from './requestFocus';
import { updateSelectionFocus } from './selectionSlice';
import { resolveFocusRefDeferring } from './resolveFocusRefDeferring';

export function* watchRequestFocusSaga() {
  yield* takeLatest(requestFocus, function* (action) {
    const ref = yield* resolveFocusRefDeferring(action.payload);
    yield* put(updateSelectionFocus(ref));
  });
}
