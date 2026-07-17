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
 *      and the lens FOV. When the camera is not ready yet the saga DEFERS on the
 *      `engineStatusChanged` pulse rather than dropping the tween: a deep-link
 *      focus whose id resolves statically (a scene body, the Milky Way, a star)
 *      fires `updateSelectionFocus` during bootstrap, before `initGpu` has built
 *      `state.cam`, so `cameraRuntime()` is momentarily null. Galaxy deep links
 *      dodge this because their `updateSelectionFocus` is itself deferred on
 *      `catalogLoaded`, which only fires after the camera exists. `takeLatest`
 *      (not `takeEvery`) aborts a still-waiting worker if a newer focus arrives,
 *      exactly as `watchRequestFocusSaga` aborts a stale ref deferral;
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
import { takeLatest, take, getContext, put } from 'typed-redux-saga';

import { updateSelectionFocus } from './selectionSlice';
import { startCameraTween } from '../camera/cameraSlice';
import { focusTweenDescriptor } from '../camera/focusTweenDescriptor';
import { extractSelectionRow } from '../../services/engine/helpers/extractSelectionRow';
import { suspendDuringClip } from './suspendDuringClip';
import { engineStatusChanged } from '../engine/engineSlice';
import type { SagaContext } from '../../store/types';

export function* watchFocusTweenSaga() {
  yield* takeLatest(
    updateSelectionFocus,
    suspendDuringClip(function* (action) {
      const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
      const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');

      const row = extractSelectionRow(action.payload, resolveDeps());
      if (row === null) return;

      // A focus that resolves during bootstrap can outrun the camera: the ref is
      // known but `state.cam` (hence `cameraRuntime()`) isn't built until wireInput
      // runs. Defer on the engine-status pulse — the first one past bootstrap fires
      // after the camera exists — re-reading the live Resources each time, so the
      // tween lands once the camera is ready instead of being dropped. `takeLatest`
      // discards this waiting worker if a newer focus supersedes it.
      let runtime = cameraRuntime();
      while (runtime === null) {
        yield* take(engineStatusChanged);
        runtime = cameraRuntime();
      }

      yield* put(startCameraTween(focusTweenDescriptor(row, runtime.from, runtime.fovYRad)));
    }),
  );
}
