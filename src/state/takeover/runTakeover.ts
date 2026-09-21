/**
 * runTakeover — the snapshot → start → body → restore → end bracket tours and
 * exhibits share. `body` is caller-supplied and arbitrary, so this file
 * imports nothing tour- or exhibit-specific: neither feature knows the other
 * exists.
 * `cancelled()` is true only when the run was superseded from outside, where
 * the takeover passes to a successor rather than ending — so no `takeoverEnded`.
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
