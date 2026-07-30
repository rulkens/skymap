/**
 * rootSaga — the store's single saga entry point, COMPOSING the feature sagas.
 *
 * The store wires the saga middleware and runs this root saga at construction.
 * The root only composes; it forks every feature watcher:
 *   watchTierSaga          — runs the tier transition (per-source reload + famous rebuild)
 *   watchWakeSaga          — requests a render frame on every settings write
 *   watchFlowReseedSaga    — reseeds the flow particle field when mode or count changes
 *   watchSwapFormatSaga    — reconfigures the swap chain on hdr.enabled or display-capability changes
 *   watchBiasBakeSaga      — rebakes the brightness bias LUT when BiasMode changes
 *   watchFadesSaga         — syncs visibility-layer fades via the FADE_ROW table
 *   watchSelectionRowsSaga — keeps the selectionRows derived cache in sync with selection refs
 *   watchSelectionWakeSaga — wakes the render loop on select/focus writes (hover excluded)
 *   watchRequestFocusSaga  — resolves a durable focus id to a ref, deferring on catalogLoaded
 *   watchRequestSelectSaga — resolves a durable focus id to a ref and PINS it in the select slot
 *   watchFocusTweenSaga    — builds + dispatches the camera tween on every focus ref change
 *   watchOrientationChangeSaga — persists the frame + rolls the up-basis from the live pole on each orientation switch
 *   watchTourSaga          — starts a guidedTourSaga run on each startTour (takeLatest — single-instance)
 *   watchKeyboardEventsSaga — drains the global keyboard channel; dispatches each key's built action (tour keys gated by selectTourActive)
 *   watchLogCameraStateSaga — prints the live camera pose on each logCameraState command (the `l` key)
 *   watchClipSaga          — runs the clip-player seam on each playClip; stopClip/re-play cancels it
 *   watchClipPathInspectSaga — samples a clip's camera route into the debug inspector on inspectClipPath/clearClipPath
 *   watchReplayInspectedPathSaga — replays the inspector's pinned route verbatim on replayInspectedPath
 *   watchGoHomeSaga        — pins Earth and tweens to the sunlit home pose on each goHome intent
 *   watchHashSaga          — the `window.location.hash` bridge, both directions: applies the arrival hash and every back/forward navigation, and republishes the hash whenever a param's source moves
 *
 * Each watcher is one saga per file, named after the saga, authored beside its
 * concern (the tier watcher in `state/tier/watchTierSaga`, the reconcile watchers
 * in `effects/watch*Saga`) and their worker bodies reach the engine via
 * `getContext` lazily.
 *
 * Composing the watchers before the engine registers the saga context is safe,
 * for a reason worth stating exactly. Almost every watcher here is REACTIVE: its
 * worker body does not run until an action arrives, and by then the engine — which
 * registers the context synchronously right after building the store — has filled
 * the bag. One watcher is not reactive. `watchHashSaga`'s read half dispatches on
 * its own initiative, from the arrival URL, and the store factory runs this root
 * saga before it returns — so it would otherwise dispatch into watchers whose
 * context does not exist yet, and a throw in any one of them cancels this whole
 * `all`. That is why `watchHashSaga` waits for `sagaContextRegistered` before it
 * forks either half, instead of assuming the context is there. Any future watcher
 * that dispatches at start-up rather than on an action inherits the same
 * obligation.
 *
 * Later phases add watchers the same way — by appending forks to this `all` array,
 * never by re-threading `createSagaMiddleware`/`run` through the factory.
 *
 * `all([...])` runs the forked watchers concurrently; typed-redux-saga's
 * `all<T>(effects: T[])` yields once every effect has been started, so the
 * running root saga stays alive forking its children.
 */

import { all } from 'typed-redux-saga';

import { watchTierSaga } from '../state/tier/watchTierSaga';
import { watchWakeSaga } from './effects/watchWakeSaga';
import { watchFlowReseedSaga } from './effects/watchFlowReseedSaga';
import { watchSwapFormatSaga } from './effects/watchSwapFormatSaga';
import { watchBiasBakeSaga } from './effects/watchBiasBakeSaga';
import { watchFadesSaga } from './effects/watchFadesSaga';
import { watchSelectionRowsSaga } from '../state/selectionRows/watchSelectionRowsSaga';
import { watchSelectionWakeSaga } from '../state/selection/watchSelectionWakeSaga';
import { watchRequestFocusSaga } from '../state/selection/watchRequestFocusSaga';
import { watchRequestSelectSaga } from '../state/selection/watchRequestSelectSaga';
import { watchFocusTweenSaga } from '../state/selection/watchFocusTweenSaga';
import { watchOrientationChangeSaga } from '../state/camera/watchOrientationChangeSaga';
import { watchTourSaga } from '../state/tour/watchTourSaga';
import { watchKeyboardEventsSaga } from '../state/input/watchKeyboardEventsSaga';
import { watchLogCameraStateSaga } from '../state/camera/watchLogCameraStateSaga';
import { watchClipSaga } from '../state/camera/watchClipSaga';
import { watchClipPathInspectSaga } from '../state/camera/watchClipPathInspectSaga';
import { watchReplayInspectedPathSaga } from '../state/camera/watchReplayInspectedPathSaga';
import { watchGoHomeSaga } from '../state/selection/watchGoHomeSaga';
import { watchHashSaga } from '../state/url/watchHashSaga';

export function* mainSaga() {
  yield* all([
    watchTierSaga(),
    watchWakeSaga(),
    watchFlowReseedSaga(),
    watchSwapFormatSaga(),
    watchBiasBakeSaga(),
    watchFadesSaga(),
    watchSelectionRowsSaga(),
    watchSelectionWakeSaga(),
    watchRequestFocusSaga(),
    watchRequestSelectSaga(),
    watchFocusTweenSaga(),
    watchOrientationChangeSaga(),
    watchTourSaga(),
    watchKeyboardEventsSaga(),
    watchLogCameraStateSaga(),
    watchClipSaga(),
    watchClipPathInspectSaga(),
    watchReplayInspectedPathSaga(),
    watchGoHomeSaga(),
    watchHashSaga(),
  ]);
}
