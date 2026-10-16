/**
 * watchFocusSelectedSaga — on each `focusSelected` command, copies the current
 * select ref into the focus slot. Nothing selected writes null, which releases
 * focus and lifts the cluster-focus fade (a double-click on empty sky).
 */
import { takeEvery, put, select } from 'typed-redux-saga';

import { focusSelected } from './focusSelected';
import { selectSelectedRef } from './selectors';
import { updateSelectionFocus } from './selectionSlice';

function* focusSelectedWorker() {
  yield* put(updateSelectionFocus(yield* select(selectSelectedRef)));
}

export function* watchFocusSelectedSaga() {
  yield* takeEvery(focusSelected, focusSelectedWorker);
}
