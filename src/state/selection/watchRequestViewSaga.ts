/**
 * watchRequestViewSaga — turns a palette pick's `requestView` into how the
 * view is shown. Today that is always a focus fly; `watchRequestFocusSaga`
 * then resolves the id.
 */
import { takeEvery, put } from 'typed-redux-saga';

import { requestView } from './requestView';
import { requestFocus } from './requestFocus';

export function* watchRequestViewSaga() {
  yield* takeEvery(requestView, function* (action) {
    yield* put(requestFocus({ id: action.payload.id, transition: 'fly' }));
  });
}
