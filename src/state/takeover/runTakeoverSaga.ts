/**
 * runTakeoverSaga — the start → body → end bracket every takeover kind shares.
 * What a kind holds and gives back (the scene, the clock) is its body's own
 * bracket, so this file imports nothing kind-specific.
 * `cancelled()` is true only when the run was superseded from outside, where
 * the takeover passes to a successor rather than ending — so no `takeoverEnded`.
 */
import { cancelled, put } from 'typed-redux-saga';

import { takeoverStarted, takeoverEnded } from './takeoverActions';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

export function* runTakeoverSaga(source: TakeoverSource, body: () => Generator): Generator {
  yield* put(takeoverStarted(source));
  try {
    yield* body();
  } finally {
    if (!(yield* cancelled())) {
      yield* put(takeoverEnded());
    }
  }
}
