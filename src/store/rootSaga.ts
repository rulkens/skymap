/**
 * rootSaga — the store's single saga entry point, deliberately empty for now.
 *
 * The store wires the saga middleware and runs this root saga at construction
 * even though it forks nothing yet. That up-front plumbing is the point: the
 * seam's phase 2 fills this `all([])` with the feature sagas (render-wake,
 * fade-triggering, demand re-evaluation) by adding forks, without having to
 * re-thread `createSagaMiddleware`/`run` through the store factory again. The
 * empty root keeps the construction path identical between "no behaviour yet"
 * and "behaviour added later".
 *
 * `all([])` (over the empty array) is the form chosen over a bare empty generator
 * because it makes the forthcoming shape explicit — the next edit appends fork
 * effects to this array rather than introducing the `all` combinator from
 * scratch. typed-redux-saga's `all<T>(effects: T[])` accepts the empty array
 * (T infers to `unknown`) and yields immediately, so the running saga completes
 * cleanly with nothing forked.
 */

import { all } from 'typed-redux-saga';

export function* mainSaga() {
  yield* all([]);
}
