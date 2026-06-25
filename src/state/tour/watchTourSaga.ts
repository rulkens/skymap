/**
 * watchTourSaga — the watcher that launches a guided-tour run.
 *
 * `takeLatest` cancels any in-progress run when a new startTour arrives — the
 * tour is single-instance, so a new start always supersedes the previous one.
 * `guidedTourSaga` itself handles exitTour via an internal race, so the watcher
 * simply delegates the full run.
 */

import { call, takeLatest } from 'typed-redux-saga';

import { guidedTourSaga } from './guidedTourSaga';
import { startTour } from './tourActions';

export function* watchTourSaga() {
  yield* takeLatest(startTour, function* (action) {
    yield* call(guidedTourSaga, action.payload.beats);
  });
}
