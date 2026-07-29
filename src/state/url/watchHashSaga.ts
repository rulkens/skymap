/**
 * watchHashSaga — the `window.location.hash` bridge, entire. One fork line in
 * `mainSaga` for both directions.
 *
 * ### Why one parent over two forks
 *
 * The read and write halves are not two features that happen to sit near each
 * other: they share one resource (the address bar), one table
 * (`HASH_PARAM_SOURCES`) and one invariant — that `pushState` fires no
 * `hashchange`, which is the only reason they can run concurrently over that
 * resource without feeding each other. Forking them separately would put that
 * relatedness nowhere: `mainSaga`'s list would read as two independent
 * watchers, and a future reader deciding whether the write may switch to
 * `replaceState` would have no single place where the pair's contract lives.
 * A parent puts them under one name and one docblock.
 *
 * ### Why still two sagas
 *
 * Their control flow has nothing in common. The read half owns a channel and
 * blocks on it in a drain loop with a teardown; the write half is a stateless
 * `takeEvery` over an action predicate. Folding them into one body would need
 * an inner fork anyway — the same two sagas, minus the names.
 */

import { all } from 'typed-redux-saga';

import { watchHashReadSaga } from './watchHashReadSaga';
import { watchHashWriteSaga } from './watchHashWriteSaga';

export function* watchHashSaga() {
  yield* all([watchHashReadSaga(), watchHashWriteSaga()]);
}
