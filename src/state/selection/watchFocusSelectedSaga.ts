/**
 * watchFocusSelectedSaga — on each `focusSelected` command, copies the current
 * select ref into the focus slot; nothing selected is a no-op.
 */
import { takeEvery, put, select } from 'typed-redux-saga';

import { focusSelected } from './focusSelected';
import { selectSelectedRef } from './selectors';
import { updateSelectionFocus } from './selectionSlice';

function* focusSelectedWorker() {
  const ref = yield* select(selectSelectedRef);
  if (ref) yield* put(updateSelectionFocus(ref));
}

export function* watchFocusSelectedSaga() {
  yield* takeEvery(focusSelected, focusSelectedWorker);
}
