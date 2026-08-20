/**
 * rootSaga — composes every feature watcher saga, forked in the `all([...])`
 * array below; that array IS the watcher list, so this comment doesn't restate it.
 *
 * Composing before the engine registers the saga context is safe because every
 * watcher here is reactive except `watchHashSaga`'s read half, which waits on
 * `sagaContextRegistered` for exactly that reason — see that module's header
 * for the full argument.
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
import { watchFlyToLonLatSaga } from '../state/camera/watchFlyToLonLatSaga';
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
    watchFlyToLonLatSaga(),
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
