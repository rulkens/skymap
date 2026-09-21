/**
 * watchTakeoverSaga — the single mutual-exclusion point for every takeover
 * source (today `startTour`; `openView` joins `startRequests` in a later task).
 * A superseding request cancels the running takeover and waits for the whole
 * cancelled bracket to settle before the successor starts, so the successor
 * snapshots the user's pre-takeover scene and not a mid-takeover one.
 */

import { call, cancel, fork, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { runTakeover } from './runTakeover';
import { tourBody } from '../tour/tourBody';
import { startTour } from '../tour/tourActions';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

const startRequests = [startTour];

export function* watchTakeoverSaga() {
  let running: Task | undefined;
  let settled = Promise.resolve();

  while (true) {
    const action = yield* take(startRequests);

    if (running) {
      // `cancel` only INITIATES cancellation: the outgoing run's `finally`
      // parks on the restore's `put`s, which the scheduler queues behind the
      // dispatch being flushed. `join`/`toPromise` both resolve the moment
      // `cancel` runs, and `join` would propagate the cancellation into this
      // watcher — the wrapper's `finally` below is the only settle signal.
      yield* cancel(running);
      yield* call(() => settled);
    }

    const tour = tourRegistry[action.payload.id];
    const source: TakeoverSource = { kind: 'tour', id: tour.id };
    const body = () => tourBody(tour, action.payload.beats);

    let markSettled = () => {};
    settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });
    running = yield* fork(function* () {
      try {
        yield* call(runTakeover, source, body);
      } finally {
        markSettled();
      }
    });
  }
}
