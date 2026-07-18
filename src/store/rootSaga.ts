/**
 * rootSaga — the store's single saga entry point, COMPOSING the feature sagas.
 *
 * The store wires the saga middleware and runs this root saga at construction.
 * The root only composes; it forks every feature watcher:
 *   watchTierSaga          — runs the tier transition (per-source reload + famous rebuild)
 *   watchWakeSaga          — requests a render frame on every settings write
 *   watchFlowReseedSaga    — reseeds the flow particle field when mode or count changes
 *   watchBiasBakeSaga      — rebakes the brightness bias LUT when BiasMode changes
 *   watchFadesSaga         — syncs visibility-layer fades via the FADE_ROW table
 *   watchSelectionRowsSaga — keeps the selectionRows derived cache in sync with selection refs
 *   watchSelectionWakeSaga — wakes the render loop on select/focus writes (hover excluded)
 *   watchRequestFocusSaga  — resolves a durable focus id to a ref, deferring on catalogLoaded
 *   watchFocusTweenSaga    — builds + dispatches the camera tween on every focus ref change
 *   watchTourSaga          — starts a guidedTourSaga run on each startTour (takeLatest — single-instance)
 *   watchTourKeyboardSaga  — binds the tour nav keys (→/←/Space) only while a tour runs
 *   watchClipSaga          — runs the clip-player seam on each playClip; stopClip/re-play cancels it
 *   watchClipPathInspectSaga — samples a clip's camera route into the debug inspector on inspectClipPath/clearClipPath
 *   watchReplayInspectedPathSaga — replays the inspector's pinned route verbatim on replayInspectedPath
 *   watchFlyToEarthKeySaga — tweens the camera to Earth-surface framing on the 'e' debug key
 *
 * Each watcher is one saga per file, named after the saga, authored beside its
 * concern (the tier watcher in `state/tier/watchTierSaga`, the reconcile watchers
 * in `effects/watch*Saga`) and their worker bodies reach the engine via
 * `getContext` lazily. Composing the
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

import { watchTierSaga } from '../state/tier/watchTierSaga';
import { watchWakeSaga } from './effects/watchWakeSaga';
import { watchFlowReseedSaga } from './effects/watchFlowReseedSaga';
import { watchBiasBakeSaga } from './effects/watchBiasBakeSaga';
import { watchFadesSaga } from './effects/watchFadesSaga';
import { watchSelectionRowsSaga } from '../state/selectionRows/watchSelectionRowsSaga';
import { watchSelectionWakeSaga } from '../state/selection/watchSelectionWakeSaga';
import { watchRequestFocusSaga } from '../state/selection/watchRequestFocusSaga';
import { watchFocusTweenSaga } from '../state/selection/watchFocusTweenSaga';
import { watchTourSaga } from '../state/tour/watchTourSaga';
import { watchTourKeyboardSaga } from '../state/tour/watchTourKeyboardSaga';
import { watchClipSaga } from '../state/camera/watchClipSaga';
import { watchClipPathInspectSaga } from '../state/camera/watchClipPathInspectSaga';
import { watchReplayInspectedPathSaga } from '../state/camera/watchReplayInspectedPathSaga';
import { watchFlyToEarthKeySaga } from '../state/scene/watchFlyToEarthKeySaga';

export function* mainSaga() {
  yield* all([
    watchTierSaga(),
    watchWakeSaga(),
    watchFlowReseedSaga(),
    watchBiasBakeSaga(),
    watchFadesSaga(),
    watchSelectionRowsSaga(),
    watchSelectionWakeSaga(),
    watchRequestFocusSaga(),
    watchFocusTweenSaga(),
    watchTourSaga(),
    watchTourKeyboardSaga(),
    watchClipSaga(),
    watchClipPathInspectSaga(),
    watchReplayInspectedPathSaga(),
    watchFlyToEarthKeySaga(),
  ]);
}
