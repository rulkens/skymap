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
      const NOT_YET_LOADED: Partial<Record<NonNullable<typeof action.payload>['type'], Deferral>> =
        {
          star: {
            empty: () => resolveDeps().stars.current() === null,
            pulse: engineSourceCountReported,
          },
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
