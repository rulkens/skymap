/**
 * runLayerFeedSaga — the one saga both `Layer.search` and `Layer.sourceCounts`
 * run through: pull the feed, run the consumer saga inline on each value (so
 * its `put`s are ordered against the pull), close the iterator when core
 * cancels the task at teardown. A feed that rejects ends quietly: a Layer that
 * stops reporting must not take the root saga down with it.
 */

import { call, cancelled } from 'typed-redux-saga';
import type { SagaIterator } from 'redux-saga';

export function* runLayerFeedSaga<T>(
  feed: AsyncIterable<T>,
  consumeSaga: (value: T) => SagaIterator,
): SagaIterator {
  const iterator = feed[Symbol.asyncIterator]();
  try {
    for (;;) {
      let result: IteratorResult<T>;
      try {
        result = yield* call(() => iterator.next());
      } catch (error) {
        console.warn('runLayerFeedSaga: the feed threw; this Layer stops reporting', error);
        return;
      }
      if (result.done === true) return;
      yield* consumeSaga(result.value);
    }
  } finally {
    // Cancellation arrives as a generator `return()`, so this is the only place
    // the feed's own `return()` — the unsubscribe behind `callbackIterable` — runs.
    if (yield* cancelled()) yield* call(() => iterator.return?.() ?? Promise.resolve());
  }
}
