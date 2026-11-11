/**
 * watchTakeoverSaga — the single mutual-exclusion point for every takeover
 * source (`startTour`, `openExhibit`, `startClip`, `enterSky`). A superseding request cancels the running
 * takeover and waits for the whole cancelled bracket to settle before the
 * successor starts, so the successor snapshots the user's pre-takeover scene
 * and not a mid-takeover one. A sky entry over a running sky takeover inherits
 * its restore, so Leave returns to the camera from before the first entry (D11).
 */

import { call, cancel, fork, select, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { runTakeoverSaga } from './runTakeoverSaga';
import { withSceneSnapshotSaga } from './withSceneSnapshotSaga';
import { tourBodySaga } from '../tour/tourBodySaga';
import { startTour } from '../tour/tourActions';
import { exhibitBodySaga } from '../exhibits/exhibitBodySaga';
import { openExhibit } from '../exhibits/exhibitActions';
import { clipBodySaga } from '../camera/clipBodySaga';
import { startClip } from '../camera/clipActions';
import { skyBodySaga } from '../sky/skyBodySaga';
import { enterSky } from '../sky/enterSky';
import { selectTakeoverSource } from './selectors';
import { selectCameraBase, selectFovYRad } from '../camera/selectors';
import { selectFocusRef } from '../selection/selectors';
import { APP_TOUR_REGISTRY } from '../../compositions/appTours';
import { APP_EXHIBIT_REGISTRY } from '../../compositions/appExhibits';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

const startRequests = [startTour, openExhibit, startClip, enterSky];

export function* watchTakeoverSaga() {
  let running: Task | undefined;
  let settled = Promise.resolve();

  while (true) {
    const action = yield* take(startRequests);
    // Read before the cancel: a cancelled run puts no `takeoverEnded`, so this is still it.
    const outgoing = yield* select(selectTakeoverSource);

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
    // body — `runTakeoverSaga` itself stays generic over every kind (see its header).
    let source: TakeoverSource;
    let body: () => Generator;
    if (startTour.match(action)) {
      const tour = APP_TOUR_REGISTRY[action.payload.id];
      source = { kind: 'tour', id: tour.id };
      body = () => withSceneSnapshotSaga(() => tourBodySaga(tour, action.payload.beats));
    } else if (openExhibit.match(action)) {
      const { id, entry, atLinkedTime = false, fromLink = false, layers } = action.payload;
      const exhibit = APP_EXHIBIT_REGISTRY[id];
      source = { kind: 'exhibit', id: exhibit.id, entry };
      body = () =>
        withSceneSnapshotSaga(() => exhibitBodySaga(exhibit, entry, atLinkedTime, layers), {
          exitsLive: fromLink,
        });
    } else if (startClip.match(action)) {
      const id = action.payload;
      source = { kind: 'clip', id };
      body = () => clipBodySaga(id);
    } else if (enterSky.match(action)) {
      const { spot, pointLocalM } = action.payload;
      const restore =
        outgoing?.kind === 'sky'
          ? outgoing.restore
          : {
              base: yield* select(selectCameraBase),
              fovYRad: yield* select(selectFovYRad),
              focus: yield* select(selectFocusRef),
            };
      source = { kind: 'sky', spot, restore };
      body = () => skyBodySaga(spot, pointLocalM, restore);
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
        yield* call(runTakeoverSaga, source, body);
      } finally {
        markSettled();
      }
    });
  }
}
