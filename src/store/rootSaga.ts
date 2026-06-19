/**
 * rootSaga — the store's single saga entry point.
 *
 * Runs four reconcile watchers in parallel:
 *   watchWake       — requests a render frame on every settings write
 *   watchFlowReseed — reseeds the flow particle field when mode or count changes
 *   watchBiasBake   — rebakes the brightness bias LUT when BiasMode changes
 *   watchFades      — syncs visibility-layer fades via the FADE_ROW table
 *
 * Each watcher's worker body reaches the engine via `getContext('reconcile')`,
 * so composing the watchers before the context is registered (Task 2.4) is safe:
 * no worker body runs until an action arrives, and the engine registers the
 * context at construction before any settings dispatch can occur.
 */

import { all } from 'typed-redux-saga';

import { watchWake, watchFlowReseed, watchBiasBake, watchFades } from './effects/reconcileSagas';

export function* mainSaga() {
  yield* all([watchWake(), watchFlowReseed(), watchBiasBake(), watchFades()]);
}
