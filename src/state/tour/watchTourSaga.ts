/**
 * watchTourSaga — the watcher that launches a guided-tour run.
 *
 * `takeLatest` cancels any in-progress run when a new startTour arrives — the
 * tour is single-instance, so a new start always supersedes the previous one.
 * The dispatched `TourId` is resolved against `tourRegistry` here, at the action
 * boundary; `guidedTourSaga` plays the resolved tour's beats and handles
 * exitTour via an internal race, so the watcher simply delegates the full run.
 */

import { call, takeLatest } from 'typed-redux-saga';

import { guidedTourSaga } from './guidedTourSaga';
import { startTour } from './tourActions';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';

export function* watchTourSaga() {
  yield* takeLatest(startTour, function* (action) {
    const tour = tourRegistry[action.payload.id];
    yield* call(guidedTourSaga, tour.beats);
  });
}
