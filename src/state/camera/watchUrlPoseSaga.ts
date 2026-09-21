/**
 * watchUrlPoseSaga — commits a `#pose=` deep link. The hash read pass runs
 * before `wireInput` seeds `camera.base` (`sagaContextRegistered`, ahead of
 * the async bootstrap), so a direct commit here would be overwritten; deferred
 * until the engine reports ready, it lands as an outside commit and holds.
 */
import { takeLatest, select, take, put } from 'typed-redux-saga';

import { applyUrlPose } from './applyUrlPose';
import { commitCameraPose } from './cameraSlice';
import { engineStatusChanged } from '../engine/engineSlice';
import { selectEngineStatus } from '../engine/selectors';

export function* watchUrlPoseSaga() {
  yield* takeLatest(applyUrlPose, function* (action) {
    while ((yield* select(selectEngineStatus)).kind !== 'ready') {
      yield* take(engineStatusChanged);
    }
    yield* put(commitCameraPose(action.payload));
  });
}
