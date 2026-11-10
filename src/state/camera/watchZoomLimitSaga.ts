/**
 * watchZoomLimitSaga — what a pushed zoom limit starts. A sky wheel-out plays the lift the arm
 * built, under the orientation the drain stepped in; a floor push enters sky mode at its cursor
 * anchor, on a terrain host and with no takeover running (it must not preempt a show). Leave
 * while standing with nothing to give back (a `#pose=k` link, a sky clip's end) queues a
 * `liftOff` step, which the sky arm answers with the same push as a wheel-out.
 */
import { takeEvery, select, put } from 'typed-redux-saga';

import { zoomLimitPushed } from './zoomLimitPushed';
import { clipStarted } from './cameraSlice';
import { selectClipActive } from './selectors';
import { selectOrientation } from '../settings/selectors';
import { selectSkyView } from '../engine/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import { exitTakeover } from '../takeover/takeoverActions';
import { enterSky } from '../sky/enterSky';
import { inputLiftOffRequested } from '../input/inputSlice';
import { SKY_HOSTS } from '../../data/sky/skyHosts';
import { skySpotAt } from '../../utils/geo/skySpotAt';

export function* watchZoomLimitSaga() {
  yield* takeEvery(zoomLimitPushed, function* ({ payload }) {
    if (payload.edge === 'in') {
      const free = (yield* select(selectTakeoverSource)) === null;
      if (free && SKY_HOSTS.has(payload.body)) {
        const spot = skySpotAt(payload.body, payload.pointLocalM);
        yield* put(enterSky({ spot, pointLocalM: [...payload.pointLocalM] }));
      }
      return;
    }
    // While it plays, the clip swallows every pose-moving step (`replayInput`'s `stepRegister`).
    yield* put(clipStarted({ data: payload.lift, frame: yield* select(selectOrientation) }));
  });
  yield* takeEvery(exitTakeover, function* ({ payload }) {
    if (payload?.restore !== true) return;
    const standing = (yield* select(selectSkyView)) !== null;
    const owned =
      (yield* select(selectTakeoverSource)) !== null || (yield* select(selectClipActive));
    if (standing && !owned) yield* put(inputLiftOffRequested());
  });
}
