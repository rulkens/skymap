/**
 * watchFocusTweenSaga — the camera-tween EFFECT of a focus gesture. A focus writes
 * the focus ref (updateSelectionFocus); the camera flying to that target is an
 * effect of that Intent, so it lives here as a saga — symmetric with
 * watchSelectionWakeSaga (render-wake) and watchTierSaga's runTierTransition.
 *
 * The saga is a thin resolve→build→dispatch shell:
 *   1. re-resolve the ref to a row via the live `resolveDeps` (firing on the REF,
 *      not the reconciled row, keeps the tween a response to the Intent and free
 *      of any dependence on watchSelectionRowsSaga running first);
 *   2. read the live camera Resources (`cameraRuntime`) — the visible from-pose
 *      and the lens FOV — bailing when the camera is not ready (pre-bootstrap /
 *      post-destroy), so a focus that races bootstrap or arrives after destroy
 *      simply lands the ref without a tween;
 *   3. build the `startCameraTween` payload with the pure `focusTweenDescriptor`
 *      table and dispatch it.
 *
 * The dispatch alone wakes the render loop: `startCameraTween` is a `camera/*`
 * write, which `watchWakeSaga`/WAKE_ROUTES turns into a render request — so there is
 * no separate requestRender here. A null ref (focus release) resolves to a null
 * row → no tween.
 *
 * getContext is read INSIDE the worker (per-action), like watchSelectionWakeSaga and
 * watchTierSaga, because the engine registers its saga context AFTER the root saga
 * forks.
 */
import { takeEvery, getContext, put } from 'typed-redux-saga';

import { updateSelectionFocus } from './selectionSlice';
import { startCameraTween } from '../camera/cameraSlice';
import { focusTweenDescriptor } from '../camera/focusTweenDescriptor';
import { extractSelectionRow } from '../../services/engine/helpers/extractSelectionRow';
import { suspendDuringClip } from './suspendDuringClip';
import type { SagaContext } from '../../store/types';

export function* watchFocusTweenSaga() {
  yield* takeEvery(
    updateSelectionFocus,
    suspendDuringClip(function* (action) {
      const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
      const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');

      const row = extractSelectionRow(action.payload, resolveDeps());
      if (row === null) return;

      const runtime = cameraRuntime();
      if (runtime === null) return;

      yield* put(startCameraTween(focusTweenDescriptor(row, runtime.from, runtime.fovYRad)));
    }),
  );
}
