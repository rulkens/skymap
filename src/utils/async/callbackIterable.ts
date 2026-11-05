/**
 * callbackIterable — adapt a subscribe-style source to an async iterable, so a
 * callback-fed Layer can honour `search`/`sourceCounts` without redux-saga
 * vocabulary of its own.
 *
 * `subscribe` runs once per iteration, and its unsubscribe runs exactly once,
 * on `return()` — which is what `runLayerFeedSaga` calls when core cancels the feed
 * at teardown. Values emitted before the consumer asks are BUFFERED: a slot that
 * commits between two `next()` calls would otherwise drop its report.
 *
 * SINGLE CONSUMER per iterator: one pending `next()` at a time, which is what a
 * `runLayerFeedSaga` pull loop does. A second concurrent `next()` would orphan the
 * first. `return()` settles a pending `next()` rather than leaving it hanging.
 */

export function callbackIterable<T>(
  subscribe: (emit: (value: T) => void) => () => void,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const buffered: T[] = [];
      let waiting: ((result: IteratorResult<T>) => void) | null = null;
      let closed = false;

      const unsubscribe = subscribe((value) => {
        if (waiting === null) {
          buffered.push(value);
          return;
        }
        const resolve = waiting;
        waiting = null;
        resolve({ value, done: false });
      });

      return {
        next(): Promise<IteratorResult<T>> {
          if (closed) return Promise.resolve({ value: undefined, done: true });
          if (buffered.length > 0) {
            return Promise.resolve({ value: buffered.shift() as T, done: false });
          }
          return new Promise((resolve) => {
            waiting = resolve;
          });
        },
        return(): Promise<IteratorResult<T>> {
          if (!closed) {
            closed = true;
            unsubscribe();
            const pending = waiting;
            waiting = null;
            pending?.({ value: undefined, done: true });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}
