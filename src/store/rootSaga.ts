/**
 * rootSaga — the store's single saga entry point, COMPOSING the feature sagas.
 *
 * The store wires the saga middleware and runs this root saga at construction.
 * The root only composes; it forks every feature watcher:
 *   watchTier            — runs the tier transition (per-source reload + famous rebuild)
 *   watchWake            — requests a render frame on every settings write
 *   watchFlowReseed      — reseeds the flow particle field when mode or count changes
 *   watchBiasBake        — rebakes the brightness bias LUT when BiasMode changes
 *   watchFades           — syncs visibility-layer fades via the FADE_ROW table
 *   watchSelectionRows   — keeps the selectionRows derived cache in sync with selection refs
 *   watchSelectionWake   — wakes the render loop on select/focus writes (hover excluded)
 *   watchRequestFocus    — resolves a durable focus id to a ref, deferring on catalogLoaded
 *   watchFocusTween      — builds + dispatches the camera tween on every focus ref change
 *   watchTour            — starts a guidedTour run on each TOUR_START (takeLatest — single-instance)
 *
 * Each watcher is authored beside its concern (the tier watcher in
 * `state/tier/tierSaga`, the reconcile watchers in `effects/reconcileSagas`) and
 * their worker bodies reach the engine via `getContext` lazily. Composing the
 * watchers before the engine registers the saga context is safe: no worker body
 * runs until an action arrives, and the engine registers the context at
 * construction before any settings dispatch can occur. Later phases add watchers
 * the same way — by appending forks to this `all` array, never by re-threading
 * `createSagaMiddleware`/`run` through the factory.
 *
 * `all([...])` runs the forked watchers concurrently; typed-redux-saga's
 * `all<T>(effects: T[])` yields once every effect has been started, so the
 * running root saga stays alive forking its children.
 */

import { all } from 'typed-redux-saga';

import { watchTier } from '../state/tier/tierSaga';
import { watchWake, watchFlowReseed, watchBiasBake, watchFades } from './effects/reconcileSagas';
import { watchSelectionRows } from '../state/selectionRows/selectionRowsSaga';
import { watchSelectionWake } from '../state/selection/selectionWakeSaga';
import { watchRequestFocus } from '../state/selection/requestFocusSaga';
import { watchFocusTween } from '../state/selection/focusTweenSaga';
import { watchTour } from '../state/tour/guidedTourSaga';

export function* mainSaga() {
  yield* all([
    watchTier(),
    watchWake(),
    watchFlowReseed(),
    watchBiasBake(),
    watchFades(),
    watchSelectionRows(),
    watchSelectionWake(),
    watchRequestFocus(),
    watchFocusTween(),
    watchTour(),
  ]);
}
