/**
 * watchFocusTweenSaga — the camera-tween EFFECT of a focus gesture. A focus writes
 * the focus ref (updateSelectionFocus); the camera flying to that target is an
 * effect of that Intent, so it lives here as a saga — symmetric with
 * watchSelectionWakeSaga (render-wake).
 *
 * The saga is a thin resolve→build→dispatch shell:
 *   1. re-resolve the ref to a row via the live `resolveDeps` (firing on the REF,
 *      not the reconciled row, keeps the tween a response to the Intent and free
 *      of any dependence on watchSelectionRowsSaga running first). A STAR or
 *      STRUCTURE deep link races its backing store the way a body deep link
 *      races the camera: its id resolves statically (index / durable id), so
 *      `updateSelectionFocus` fires at bootstrap, but the row returns null until
 *      the store is fed (the Gaia bin for a star; `wireStructureProjection`'s
 *      synchronous anchors group, ahead of the async bulk group, for a
 *      structure). So the row resolve DEFERS, symmetric with the camera wait
 *      below, on the `NOT_YET_LOADED` table's pulse for that ref's type — the
 *      guard is STORE PRESENCE, not row-ness: a null row with the store fed is
 *      a stale/garbage id, which drops to the no-op below rather than waiting
 *      for a pulse that never recurs. Galaxy deep links never reach here null
 *      (their `updateSelectionFocus` is itself deferred on `catalogLoaded`), so
 *      the table only needs the two entries. Both stores are already demanded
 *      at boot, so nothing here has to trigger the load — only await it;
 *   2. read the live camera Resources (`cameraRuntime`) — the visible from-pose
 *      and the lens FOV. When the camera is not ready yet the saga DEFERS on the
 *      `engineStatusChanged` pulse rather than dropping the tween: a deep-link
 *      focus whose id resolves statically (a scene body, the Milky Way, a star)
 *      fires `updateSelectionFocus` during bootstrap, before `initGpu` has built
 *      the camera, so `cameraRuntime()` is momentarily null. Galaxy deep links
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
import {
  engineStatusChanged,
  engineSourceCountReported,
  engineStructureCountsChanged,
} from '../engine/engineSlice';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import type { SagaContext } from '../../store/types';

export function* watchFocusTweenSaga() {
  yield* takeLatest(
    updateSelectionFocus,
    suspendDuringClip(function* (action) {
      const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
      const selection = yield* getContext<SagaContext['selection']>('selection');
      const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');

      // A star or structure deep link resolves its ref statically at bootstrap
      // (index-based / a durable id), before its backing store is fed, so the
      // row comes back null until that store's first commit. `NOT_YET_LOADED`
      // states the one rule ("is this ref's store still empty?") once, keyed on
      // `ref.type`, rather than a second `type === 'structure'` arm bolted onto
      // the star check below — each entry pairs the store-empty predicate with
      // the action that pulses the instant the store is fed, so the loop stays
      // a single generic shape. A garbage id/index (row null with the store
      // already fed) falls through to the no-op below rather than waiting for a
      // pulse that never recurs. `takeLatest` discards this waiter if a newer
      // focus supersedes it.
      type Deferral = {
        empty(): boolean;
        pulse: typeof engineSourceCountReported | typeof engineStructureCountsChanged;
      };
      const NOT_YET_LOADED: Partial<Record<NonNullable<typeof action.payload>['type'], Deferral>> = {
        star: { empty: () => resolveDeps().stars.current() === null, pulse: engineSourceCountReported },
        structure: {
          empty: () => resolveDeps().structures.loaded?.() === false,
          pulse: engineStructureCountsChanged,
        },
      };
      // `ref.type` never changes across retries, so the deferral (if any) is
      // looked up once; only `empty()` is re-polled per pulse.
      const deferral = action.payload ? NOT_YET_LOADED[action.payload.type] : undefined;

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
      while (row === null && deferral?.empty()) {
        yield* take(deferral.pulse);
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
      // moves. But 'body row' is BROADER than 'followed body': famous stars are
      // scene bodies too (star-body presence), yet they are static, so the follow
      // driver leaves them and they must fall through to the tween. Gate on the
      // SAME predicate the follow driver activates on, rather than a bare
      // `row.type === 'body'` that would swallow a famous-star focus into a no-op
      // neither mechanism honours.
      if (bodyMovesThisFrame(row)) return;

      // A focus that resolves during bootstrap can outrun the camera: the ref is
      // known but the camera (hence `cameraRuntime()`) isn't seeded until wireInput
      // runs. Defer on the engine-status pulse — the first one past bootstrap fires
      // after the camera exists — re-reading the live Resources each time, so the
      // tween lands once the camera is ready instead of being dropped. `takeLatest`
      // discards this waiting worker if a newer focus supersedes it.
      let runtime = cameraRuntime();
      while (runtime === null) {
        yield* take(engineStatusChanged);
        runtime = cameraRuntime();
      }

      const frame = yield* select(selectOrientation);
      yield* put(startCameraTween(focusTweenDescriptor(row, runtime.from, runtime.fovYRad, frame)));
    }),
  );
}
