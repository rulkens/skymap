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
import { clipStarted } from '../camera/cameraSlice';
import { selectSkyView } from '../engine/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { liveCameraRuntimeSaga } from '../navigation/liveCameraRuntimeSaga';
import { skyLookFor } from '../sky/skyLookFor';
import { skyBelowHorizonSet } from '../sky/skySlice';
import { all, tween } from '../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { rowFor } from '../../services/engine/camera/arms/rowFor';
import { datumOnlyTerrainHeight } from '../../utils/camera/terrain/datumOnlyTerrainHeight';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { isUnderfoot } from '../../utils/sky/isUnderfoot';
import { wrapRad } from '../../utils/math/wrapRad';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { SKY_BELOW_HORIZON_LOOK_RAD } from '../../data/sky/skyBelowHorizonLookRad';
import { SKY_LOOK_SEC } from '../../data/sky/skyLookSec';
import type { Effect } from '../../@types/animation/Effect';
import type { PlacedRow } from '../../@types/engine/selection/PlacedRow';
import type { SagaContext } from '../../store/types';

export function* watchRequestViewSaga() {
  yield* takeLatest(requestView, function* (action) {
    const { id } = action.payload;
    const view = yield* select(selectSkyView);
    const takeover = yield* select(selectTakeoverSource);
    if (view === null || (takeover !== null && takeover.kind !== 'sky')) {
      yield* put(requestFocus({ id, transition: 'fly' }));
      return;
    }
    const selection = yield* getContext<SagaContext['selection']>('selection');
    const ref = yield* resolveFocusRefDeferringSaga(id);
    const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
    const row = selection.extractRow(ref, simDays);
    if (row === null || !('positionMpc' in row) || isUnderfoot(row, view.spot)) {
      yield* put(requestFocus({ id, transition: 'fly' }));
      return;
    }
    const runtime = yield* call(liveCameraRuntimeSaga);
    const look = skyLookFor(row as PlacedRow, view.spot, simDays, runtime.fovYRad);
    yield* put(
      skyBelowHorizonSet(
        look.kind === 'look' ? null : { riseAt: look.riseAt, neverRises: look.neverRises },
      ),
    );

    const orientation = yield* select(selectOrientation);
    const basis = ORIENTATION_FRAMES[orientation];
    const frame = { sky: view.spot };
    const ctx = {
      bodies: deriveBodyStates(simDays),
      poseBasis: basis,
      upBasis: basis,
      terrainHeightAt: datumOnlyTerrainHeight,
    };
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
    yield* put(
      clipStarted({
        data: { start: { ...runtime.from, fov: runtime.fovYRad }, timeline: [all(legs)] },
        frame: orientation,
      }),
    );
  });
}
