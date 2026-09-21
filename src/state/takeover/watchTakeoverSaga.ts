/**
 * watchTakeoverSaga — the single mutual-exclusion point for every takeover
 * source (`startTour`, `openExhibit`). A superseding request cancels the running
 * takeover and waits for the whole cancelled bracket to settle before the
 * successor starts, so the successor snapshots the user's pre-takeover scene
 * and not a mid-takeover one.
 */

import { call, cancel, fork, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { runTakeover } from './runTakeover';
import { tourBody } from '../tour/tourBody';
import { startTour } from '../tour/tourActions';
import { exhibitBodySaga } from '../exhibits/exhibitBodySaga';
import { openExhibit } from '../exhibits/exhibitActions';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

const startRequests = [startTour, openExhibit];

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

    // Branch on the incoming action to build this run's `TakeoverSource` and
    // body — `runTakeover` itself stays generic over both (see its header).
    let source: TakeoverSource;
    let body: () => Generator;
    if (startTour.match(action)) {
      const tour = tourRegistry[action.payload.id];
      source = { kind: 'tour', id: tour.id };
      body = () => tourBody(tour, action.payload.beats);
    } else if (openExhibit.match(action)) {
      const exhibit = exhibitRegistry[action.payload];
      source = { kind: 'exhibit', id: exhibit.id };
      body = () => exhibitBodySaga(exhibit);
    } else {
      // `take(startRequests)` widens `action` to `any` — typed-redux-saga
      // can't narrow a `take` over a mixed-creator array — so this branch is
      // load-bearing for `source`/`body`'s definite assignment below, not
      // dead code. It should never actually run; if it does, silently
      // `continue`-ing would leave `running`/`settled` pointing at the
      // previous run while the user sees a takeover that never starts.
      throw new Error(`watchTakeoverSaga: unrecognized start request: ${JSON.stringify(action)}`);
    }

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
