/**
 * watchFocusTweenSaga — the camera-tween EFFECT of a focus gesture. A focus writes
 * the focus ref (updateSelectionFocus); the camera flying to that target is an
 * effect of that Intent, so it lives here as a saga — symmetric with
 * watchSelectionWakeSaga (render-wake). The saga is a thin resolve→build→dispatch
 * shell: it builds the `startCameraTween` payload with the pure
 * `focusTweenDescriptor` table and dispatches it.
 *
 * The dispatch alone wakes the render loop: `startCameraTween` is a `camera/*`
 * write, which `watchWakeSaga`/WAKE_ROUTES turns into a render request — so there is
 * no separate requestRender here. A null ref (focus release) resolves to a null
 * row → no tween; a `zoneOfAvoidance` row (the band has no position) is the
 * same kind of no-op, filtered right after the null check.
 *
 * getContext is read INSIDE the worker (per-action), like watchSelectionWakeSaga and
 * watchTierSaga, because the engine registers its saga context AFTER the root saga
 * forks.
 */
import { takeLatest, take, getContext, put, select } from 'typed-redux-saga';

import { updateSelectionFocus } from './selectionSlice';
import { startCameraTween } from '../camera/cameraSlice';
import { focusTweenDescriptor } from '../camera/focusTweenDescriptor';
import { ROW_FOCUSABLE } from '../../services/engine/helpers/rowFocusable';
import { bodyMovesThisFrame } from '../../utils/scene/bodyMovesThisFrame';
import { suspendDuringClip } from './suspendDuringClip';
import { engineStatusChanged, factsReported } from '../engine/engineSlice';
import { selectStructureBulk } from '../engine/selectors';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import type { SagaContext } from '../../store/types';

export function* watchFocusTweenSaga() {
  yield* takeLatest(
    updateSelectionFocus,
    suspendDuringClip(function* (action) {
      const selection = yield* getContext<SagaContext['selection']>('selection');
      const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');

      // A cut lands with no move; `navigateSaga` commits its framing.
      if (action.meta.transition === 'cut') return;

      // A focus that resolves before `wireInput` runs has no camera to fly yet.
      while (cameraRuntime() === null) {
        yield* take(engineStatusChanged);
      }

      // A structure deep link resolves statically at bootstrap, so its row is
      // null until the store is fed. It waits only while the bulk slot is
      // loading: an idle (undemanded), ready or failed slot will not fill the
      // row, so a garbage id falls through to the no-op below. `bulk` is re-read
      // after every `factsReported`, which pulses for every Layer's facts.
      // `takeLatest` discards this waiter if a newer focus supersedes it.
      const waitsOnBulk = action.payload?.type === 'structure';

      // Off-frame resolve — same `deriveSimDays(time, nowMs)` derivation
      // `watchGoHomeSaga` uses, so a body row's position matches where the
      // render path draws it. Re-derived on each retry below: the wait can
      // span real time (a catalog landing), so a stale sample would only
      // matter for the (currently impossible) case of a body ref racing a
      // catalog — re-selecting keeps it correct regardless.
      let row = selection.extractRow(
        action.payload,
        deriveSimDays(yield* select(selectTimeState), performance.now()),
      );
      while (row === null && waitsOnBulk && (yield* select(selectStructureBulk)) === 'loading') {
        yield* take(factsReported);
        row = selection.extractRow(
          action.payload,
          deriveSimDays(yield* select(selectTimeState), performance.now()),
        );
      }
      if (row === null) return;

      // Some rows (the zone-of-avoidance band today) have no focus target —
      // ROW_FOCUSABLE is exhaustive over SelectionRow['type'], so a future
      // non-focusable arm fails to compile there until declared, instead of
      // silently reaching focusFraming's throw. This is the ONE place every
      // `updateSelectionFocus` dispatch funnels through (InfoCard,
      // double-click, keyboard shortcut, deep link, tour restore), so it's
      // the enforcement site for that invariant: a no-op here, not a crash
      // inside the saga worker.
      if (!ROW_FOCUSABLE[row.type]) return;

      // A body the follow rows WILL handle is followed, not tweened — the
      // tween compiles fixed vec3 endpoints and cannot track a body the sim clock
      // moves. Gate on `bodyMovesThisFrame` rather than a bare `row.type ===
      // 'body'`: a focused S-star is a `starCatalog` row, not a body row, but
      // the sim clock still moves it, so a type-only gate would miss it and
      // tween a moving target instead of following it.
      if (bodyMovesThisFrame(row)) return;

      // Known ready since the wait above; re-read rather than reuse, since a
      // long catalog defer can move `from`/`fovYRad` in the meantime.
      const runtime = cameraRuntime()!;
      const frame = yield* select(selectOrientation);
      yield* put(startCameraTween(focusTweenDescriptor(row, runtime.from, runtime.fovYRad, frame)));
    }),
  );
}
