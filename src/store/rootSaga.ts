/**
 * rootSaga — the store's single saga entry point, COMPOSING the feature sagas.
 *
 * The store wires the saga middleware and runs this root saga at construction.
 * The root only composes: each watcher is authored beside its slice (the tier
 * watcher lives in `state/tier/tierSaga`, not here) and the root forks them all.
 * The seam's later phases add render-wake, fade-triggering, and demand
 * re-evaluation watchers the same way — by appending their forks to this `all`
 * array, never by re-threading `createSagaMiddleware`/`run` through the factory.
 *
 * `all([...])` runs the forked watchers concurrently; typed-redux-saga's
 * `all<T>(effects: T[])` yields once every effect has been started, so the
 * running root saga stays alive forking its children.
 */

import { all } from 'typed-redux-saga';

import { watchTier } from '../state/tier/tierSaga';

export function* mainSaga() {
  yield* all([watchTier()]);
}
