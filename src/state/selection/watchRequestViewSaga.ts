/**
 * watchRequestViewSaga — turns a palette pick's `requestView` into how the view is shown.
 * Standing (the camera frame is sky, D9) and free of other shows, a lookable row turns the head
 * (`lookSaga`) and focus stays, since the sky arm lets go of a focus outside its body. Anything
 * else is a focus fly that `watchRequestFocusSaga` resolves.
 */
import { call, getContext, put, select, takeLatest } from 'typed-redux-saga';

import { requestView } from './requestView';
import { requestFocus } from './requestFocus';
import { resolveFocusRefDeferringSaga } from './resolveFocusRefDeferringSaga';
import { clipEnded } from '../camera/cameraIntentSlice';
import { selectSkyView } from '../sky/selectSkyView';
import { selectTakeoverSource } from '../takeover/selectors';
import { selectClipOwner } from '../camera/selectors';
import { selectTimeState } from '../time/selectors';
import { lookSaga } from '../sky/sagas/lookSaga';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { isSkyLookable } from '../../utils/sky/isSkyLookable';
import type { SagaContext } from '../../store/types';

export function* watchRequestViewSaga() {
  yield* takeLatest(requestView, function* (action) {
    const { id } = action.payload;
    const selection = yield* getContext<SagaContext['selection']>('selection');
    // Resolving can wait on a catalog; standing is read once it is done.
    const ref = yield* resolveFocusRefDeferringSaga(id);
    const view = yield* select(selectSkyView);
    const takeover = yield* select(selectTakeoverSource);
    if (view === null || (takeover !== null && takeover.kind !== 'sky')) {
      yield* call(fly, id);
      return;
    }
    const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
    const row = selection.extractRow(ref, simDays);
    if (!isSkyLookable(row, view.spot)) {
      yield* call(fly, id);
      return;
    }
    yield* call(lookSaga, row, view.spot, simDays);
  });
}

// A fly asked for while a head turn still plays ends it first, since `suspendDuringClip` would
// otherwise swallow the focus tween.
function* fly(id: string) {
  if ((yield* select(selectClipOwner)) === 'skyLook') yield* put(clipEnded());
  yield* put(requestFocus({ id, transition: 'fly' }));
}
