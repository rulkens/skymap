/**
 * watchTourSaga — the watcher that launches a guided-tour run.
 *
 * `takeLatest` cancels any in-progress run when a new startTour arrives — the
 * tour is single-instance, so a new start always supersedes the previous one.
 * The dispatched `TourId` is resolved against `tourRegistry` here, at the action
 * boundary; `guidedTourSaga` receives the whole `Tour` (setup effects + beats)
 * and handles exitTour via an internal race, so the watcher simply delegates the
 * full run. The action's optional `BeatRange` passes through untouched —
 * clamping and windowing are the beat loop's concern, not the watcher's.
 */

import { call, takeLatest } from 'typed-redux-saga';

import { guidedTourSaga } from './guidedTourSaga';
import { startTour } from './tourActions';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';

export function* watchTourSaga() {
  yield* takeLatest(startTour, function* (action) {
    const tour = tourRegistry[action.payload.id];
    yield* call(guidedTourSaga, tour, action.payload.beats);
  });
}
