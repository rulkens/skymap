/**
 * watchFocusSelectedSaga — on each `focusSelected` command, copies the current
 * select ref into the focus slot. Nothing selected writes null, which releases
 * focus and lifts the cluster-focus fade (a double-click on empty sky).
 * `viewSelected` (the double-click) does the same off the ground. Standing, it only ever
 * turns the head, as a search pick does, for every kind; what it cannot look at stays
 * selected, since a search's fly would leave the sky (owner ruling, spec §5).
 */
import { getContext, takeEvery, put, select } from 'typed-redux-saga';

import { focusSelected } from './focusSelected';
import { viewSelected } from './viewSelected';
import { requestView } from './requestView';
import { selectSelectedRef } from './selectors';
import { updateSelectionFocus } from './selectionSlice';
import { selectSkyView } from '../engine/selectors';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { isSkyLookable } from '../../utils/sky/isSkyLookable';
import type { SagaContext } from '../../store/types';

function* focusSelectedWorker() {
  yield* put(updateSelectionFocus(yield* select(selectSelectedRef)));
}

function* viewSelectedWorker() {
  const view = yield* select(selectSkyView);
  if (view === null) {
    yield* focusSelectedWorker();
    return;
  }
  const ref = yield* select(selectSelectedRef);
  const selection = yield* getContext<SagaContext['selection']>('selection');
  const id = ref === null ? null : selection.focusIdOf(ref);
  const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
  if (id !== null && isSkyLookable(selection.extractRow(ref, simDays), view.spot)) {
    yield* put(requestView({ id }));
  }
}

export function* watchFocusSelectedSaga() {
  yield* takeEvery(focusSelected, focusSelectedWorker);
  yield* takeEvery(viewSelected, viewSelectedWorker);
}
