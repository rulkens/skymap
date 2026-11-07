/**
 * watchFocusSelectedSaga — on each `focusSelected` command, copies the current
 * select ref into the focus slot. Nothing selected writes null, which releases
 * focus and lifts the cluster-focus fade (a double-click on empty sky).
 * `viewSelected` (the double-click) does the same off the ground; standing, it asks
 * for the view as a search pick does, so the head turns and nothing flies (spec §5).
 */
import { getContext, takeEvery, put, select } from 'typed-redux-saga';

import { focusSelected } from './focusSelected';
import { viewSelected } from './viewSelected';
import { requestView } from './requestView';
import { selectSelectedRef } from './selectors';
import { updateSelectionFocus } from './selectionSlice';
import { selectSkyView } from '../engine/selectors';
import type { SagaContext } from '../../store/types';

function* focusSelectedWorker() {
  yield* put(updateSelectionFocus(yield* select(selectSelectedRef)));
}

function* viewSelectedWorker() {
  const ref = yield* select(selectSelectedRef);
  const selection = yield* getContext<SagaContext['selection']>('selection');
  const id = ref === null ? null : selection.focusIdOf(ref);
  if (id !== null && (yield* select(selectSkyView)) !== null) {
    yield* put(requestView({ id }));
    return;
  }
  yield* focusSelectedWorker();
}

export function* watchFocusSelectedSaga() {
  yield* takeEvery(focusSelected, focusSelectedWorker);
  yield* takeEvery(viewSelected, viewSelectedWorker);
}
