/**
 * watchZoomLimitSaga — what a pushed zoom limit starts. A sky wheel-out plays the lift the arm
 * built, under the orientation the drain stepped in; a floor push starts nothing yet.
 */
import { takeEvery, select, put } from 'typed-redux-saga';

import { zoomLimitPushed } from './zoomLimitPushed';
import { clipStarted } from './cameraSlice';
import { selectOrientation } from '../settings/selectors';

export function* watchZoomLimitSaga() {
  yield* takeEvery(zoomLimitPushed, function* ({ payload }) {
    if (payload.edge !== 'out') return;
    // While it plays, the clip swallows every pose-moving step (`replayInput`'s `stepRegister`).
    yield* put(clipStarted({ data: payload.lift, frame: yield* select(selectOrientation) }));
  });
}
