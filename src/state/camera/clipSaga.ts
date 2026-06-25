/**
 * clipSaga — the bridge from the `playClip` / `stopClip` request actions to the
 * engine's clip-player seam.
 *
 * The UI dispatches `playClip(clip)` instead of reaching an engine handle. This
 * watcher runs the hoisted `playClip` seam read from saga context — the same
 * Promise + `[CANCEL]` runner the guided tour awaits — so all of the live-pose
 * resolution, two-frame completion, and cancellation machinery is reused
 * verbatim. The seam stays the single internal entry; this saga only routes the
 * external (React) intents into it.
 *
 * ### Why `takeLatest` + an inner `race(stop)`
 *
 * `takeLatest` makes a second `playClip` cancel the in-flight run; redux-saga
 * propagates that cancellation into the seam `call`, whose `[CANCEL]` hook calls
 * `clipPlayer.stop()` (dispatching `endClip`, resetting the opacity channel, and
 * settling the Promise). The inner `race` against `take(stopClip)` gives the same
 * cancellation path an explicit trigger. Both routes converge on the existing
 * stop machinery, so no clipPlayer reference is needed here.
 *
 * A `stopClip` dispatched while nothing is playing is a harmless no-op:
 * `takeLatest` has no active task, so the `take(stopClip)` race arm is never
 * armed and the action is simply dropped.
 *
 * ### getContext is read INSIDE the worker
 *
 * The engine registers its saga context AFTER the root saga forks. Reading
 * `getContext('playClip')` inside the worker (not at fork time) guarantees the
 * context is populated by the time a `playClip` action actually arrives — the
 * same pattern as `visitBeat` / `watchFocusTween`.
 */
import { call, race, take, takeLatest, getContext } from 'typed-redux-saga';

import { playClip, stopClip } from './clipActions';
import type { SagaContext } from '../../store/types';

export function* watchClip() {
  yield* takeLatest(playClip, function* (action) {
    const playClipSeam = yield* getContext<SagaContext['playClip']>('playClip');
    yield* race({
      run: call(playClipSeam, action.payload),
      stop: take(stopClip),
    });
  });
}
