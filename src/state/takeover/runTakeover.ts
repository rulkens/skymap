/**
 * runTakeover — snapshot → start → body → restore → end: the bracket tours
 * and views share, lifted wholesale out of the old `guidedTourSaga` (now
 * `tourBody`, which owns only the beat loop). `body` is caller-supplied and
 * arbitrary, so this file never imports anything tour- or view-specific —
 * neither feature knows the other exists.
 *
 * The `cancelled()` guard on `takeoverEnded` is the subtle part: on a
 * `takeLatest` supersede the incoming run's `takeoverStarted` has already
 * landed by the time this `finally` runs (the finally's own restore yields
 * give it room to), so an unconditional `takeoverEnded` here would clobber
 * it. `cancelled()` is true only on that external-cancel path — a natural
 * finish or an `exitTakeover`-won race inside `body` completes normally, so
 * it stays false and the takeover ends as it should.
 */
import { call, cancelled, put, select } from 'typed-redux-saga';

import { captureScene } from '../scene/captureScene';
import { restoreSceneSaga } from '../scene/restoreSceneSaga';
import { takeoverStarted, takeoverEnded } from './takeoverActions';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

export function* runTakeover(source: TakeoverSource, body: () => Generator): Generator {
  const snapshot = yield* select(captureScene);
  yield* put(takeoverStarted(source));

  try {
    yield* body();
  } finally {
    yield* call(restoreSceneSaga, snapshot);
    if (!(yield* cancelled())) {
      yield* put(takeoverEnded());
    }
  }
}
