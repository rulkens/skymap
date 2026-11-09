/**
 * watchRequestViewSaga — turns a palette pick's `requestView` into how the view is shown.
 * Standing (the camera frame is sky, D9), the head turns to the target as a camera clip in the
 * sky frame — never `startClip`, which would preempt the sky takeover — and focus stays, since
 * the sky arm lets go of a focus outside its body. Anything else is a focus fly that
 * `watchRequestFocusSaga` resolves: off the ground, under another show, the ground underfoot,
 * or a row with no place to look at.
 */
import { call, getContext, put, select, takeLatest } from 'typed-redux-saga';

import { requestView } from './requestView';
import { requestFocus } from './requestFocus';
import { resolveFocusRefDeferringSaga } from './resolveFocusRefDeferringSaga';
import { clipEnded, clipStarted } from '../camera/cameraSlice';
import { selectSkyView } from '../engine/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { liveCameraRuntimeSaga } from '../navigation/liveCameraRuntimeSaga';
import { skyLookFor } from '../sky/skyLookFor';
import { skyBelowHorizonSet } from '../sky/skySlice';
import { skyArmCtxSaga } from '../sky/skyArmCtxSaga';
import { all, tween } from '../../services/engine/animation/effectHelpers';
import { rowFor } from '../../services/engine/camera/arms/rowFor';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { isSkyLookable } from '../../utils/sky/isSkyLookable';
import { wrapRad } from '../../utils/math/wrapRad';
import { SKY_BELOW_HORIZON_LOOK_RAD } from '../../data/sky/skyBelowHorizonLookRad';
import { SKY_LOOK_SEC } from '../../data/sky/skyLookSec';
import type { Effect } from '../../@types/animation/Effect';
import type { ClipData } from '../../@types/animation/ClipData';
import type { RootState, SagaContext } from '../../store/types';

export function* watchRequestViewSaga() {
  // The head turn this saga last started: a fly asked for while it still plays ends it first,
  // since `suspendDuringClip` would otherwise swallow the focus tween.
  let looking: ClipData | null = null;
  function* fly(id: string) {
    const clip = yield* select((state: RootState) => state.camera.clip);
    if (looking !== null && clip?.data === looking) yield* put(clipEnded());
    looking = null;
    yield* put(requestFocus({ id, transition: 'fly' }));
  }

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
    const runtime = yield* call(liveCameraRuntimeSaga);
    const look = skyLookFor(row, view.spot, simDays, runtime.fovYRad);
    yield* put(
      skyBelowHorizonSet(
        look.kind === 'look' ? null : { riseAt: look.riseAt, neverRises: look.neverRises },
      ),
    );

    const orientation = yield* select(selectOrientation);
    const frame = { sky: view.spot };
    const ctx = yield* call(skyArmCtxSaga, 0);
    // The clip's yaw leg opens on the start pose read in the sky frame, exactly as here, and
    // lerps plainly, so the shortest turn is measured from that same reading.
    const fromYaw = rowFor(frame).channels.encode(runtime.from, frame, ctx).yaw;
    const over = SKY_LOOK_SEC;
    const legs: Effect[] = [
      tween('yaw', { to: fromYaw + wrapRad(look.azimuthRad - fromYaw), over, frame }),
      tween('pitch', {
        to: look.kind === 'look' ? look.altitudeRad : SKY_BELOW_HORIZON_LOOK_RAD,
        over,
        frame,
      }),
    ];
    if (look.kind === 'look') legs.push(tween('fov', { to: look.fovYRad, over }));
    looking = { start: { ...runtime.from, fov: runtime.fovYRad }, timeline: [all(legs)] };
    yield* put(clipStarted({ data: looking, frame: orientation }));
  });
}
