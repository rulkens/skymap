/**
 * rootSaga — composes every feature watcher saga, forked in the `all([...])`
 * array below; that array IS the watcher list, so this comment doesn't restate it.
 *
 * Composing before the engine registers the saga context is safe because the
 * two watchers that can run earlier wait on `sagaContextRegistered`:
 * `watchHashSaga`'s read half (a URL arrival dispatched at construction) and
 * `watchWakeSaga` (UI-mount writes to a wake route, e.g. a view cover). See
 * `sagaContextRegistered`'s header for the full argument.
 */

import { all } from 'typed-redux-saga';

import { watchTierSaga } from '../state/tier/watchTierSaga';
import { watchWakeSaga } from './effects/watchWakeSaga';
import { watchSwapFormatSaga } from './effects/watchSwapFormatSaga';
import { watchFadesSaga } from './effects/watchFadesSaga';
import { watchSelectionRowsSaga } from '../state/selectionRows/watchSelectionRowsSaga';
import { watchSelectionWakeSaga } from '../state/selection/watchSelectionWakeSaga';
import { watchSelectionRevealSaga } from '../state/selection/watchSelectionRevealSaga';
import { watchRequestFocusSaga } from '../state/selection/watchRequestFocusSaga';
import { watchRequestSelectSaga } from '../state/selection/watchRequestSelectSaga';
import { watchFocusTweenSaga } from '../state/selection/watchFocusTweenSaga';
import { watchClockToSaga } from '../state/tour/watchClockToSaga';
import { watchOrientationChangeSaga } from '../state/camera/watchOrientationChangeSaga';
import { watchFlyToLonLatSaga } from '../state/camera/watchFlyToLonLatSaga';
import { watchTakeoverSaga } from '../state/takeover/watchTakeoverSaga';
import { watchKeyboardEventsSaga } from '../state/input/watchKeyboardEventsSaga';
import { watchInputWakeSaga } from '../state/input/watchInputWakeSaga';
import { watchLogCameraStateSaga } from '../state/camera/watchLogCameraStateSaga';
import { watchClipPathInspectSaga } from '../state/camera/watchClipPathInspectSaga';
import { watchReplayInspectedPathSaga } from '../state/camera/watchReplayInspectedPathSaga';
import { watchGoHomeSaga } from '../state/selection/watchGoHomeSaga';
import { watchFocusSelectedSaga } from '../state/selection/watchFocusSelectedSaga';
import { watchHashSaga } from '../state/url/watchHashSaga';
import { arrivalSaga } from '../state/arrival/arrivalSaga';

export function* mainSaga() {
  yield* all([
    watchTierSaga(),
    watchWakeSaga(),
    watchSwapFormatSaga(),
    watchFadesSaga(),
    watchSelectionRowsSaga(),
    watchSelectionWakeSaga(),
    watchSelectionRevealSaga(),
    watchRequestFocusSaga(),
    watchRequestSelectSaga(),
    watchFocusTweenSaga(),
    watchClockToSaga(),
    watchOrientationChangeSaga(),
    watchFlyToLonLatSaga(),
    watchTakeoverSaga(),
    watchKeyboardEventsSaga(),
    watchInputWakeSaga(),
    watchLogCameraStateSaga(),
    watchClipPathInspectSaga(),
    watchReplayInspectedPathSaga(),
    watchGoHomeSaga(),
    watchFocusSelectedSaga(),
    watchHashSaga(),
    arrivalSaga(),
  ]);
}
