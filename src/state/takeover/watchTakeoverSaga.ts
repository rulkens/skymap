/**
 * watchTakeoverSaga — the single mutual-exclusion point for every takeover
 * source. One `takeLatest` over the whole start-request list (today just
 * `startTour`; `openView` joins the array in a later task) so a new request
 * always cancels whatever is running first — the ordering `runTakeover`'s
 * `finally` depends on to restore before the next snapshot is taken. Two
 * watchers would each run their own `takeLatest` and race that ordering.
 */

import { call, takeLatest } from 'typed-redux-saga';

import { runTakeover } from './runTakeover';
import { tourBody } from '../tour/tourBody';
import { startTour } from '../tour/tourActions';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

export function* watchTakeoverSaga() {
  yield* takeLatest([startTour], function* (action) {
    const tour = tourRegistry[action.payload.id];
    const source: TakeoverSource = { kind: 'tour', id: tour.id };
    yield* call(runTakeover, source, () => tourBody(tour, action.payload.beats));
  });
}
