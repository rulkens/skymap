/**
 * watchTierSaga — turns the tier COMMAND into the tier WRITE.
 *
 * `requestTier` is the command a UI control or tour step dispatches; `setTier`
 * is the write. A same-tier request is a no-op: no `setTier`, because sagas
 * such as the Milky Way star reseed act on every one. The demand loop reloads
 * each slot whose last request drifts from the new tier's, and the selection
 * reconciler re-anchors slots after any reload, so the tier knows nothing
 * about selection.
 */

import { takeLatest, select, put } from 'typed-redux-saga';

import { requestTier } from './requestTier';
import { setTier } from './tierSlice';
import { selectTier } from './selectors';

export function* watchTierSaga() {
  yield* takeLatest(requestTier, function* (action) {
    const prev = yield* select(selectTier);
    if (prev === action.payload) return;
    yield* put(setTier(action.payload));
  });
}
