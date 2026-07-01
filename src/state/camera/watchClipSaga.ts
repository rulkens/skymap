/**
 * watchClipSaga — the bridge from the `startClip` / `stopClip` request actions to
 * the engine's clip-player seam.
 *
 * The UI dispatches `startClip(id)` instead of reaching an engine handle. This
 * watcher resolves the id against `clipRegistry` and runs the hoisted `playClip`
 * seam read from saga context — the same Promise + `[CANCEL]` runner the guided
 * tour awaits — so all of the live-pose resolution, two-frame completion, and
 * cancellation machinery is reused verbatim. The registry lookup lives here, at
 * the action boundary; the seam stays the single internal entry and still takes
 * a resolved `ClipData`.
 *
 * ### Why `takeLatest` + an inner `race(stop)`
 *
 * `takeLatest` makes a second `startClip` cancel the in-flight run; redux-saga
 * propagates that cancellation into the seam `call`, whose `[CANCEL]` hook calls
 * `clipPlayer.stop()` (dispatching `clipEnded`, resetting the opacity channel, and
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
 * same pattern as `visitBeatSaga` / `watchFocusTweenSaga`.
 *
 * ### Foci are resolved here too, not just in the tour
 *
 * A clip carrying `moveTargetId` / `dollyToId` / `focusId` / `flyPath`-with-
 * `atFocus` cues cannot be compiled until those ids resolve against loaded
 * catalog/structure data — `compileClip` throws on an unresolved cue. The tour
 * path (`visitBeatSaga`) waits on `clipFociReady` then calls `resolveClipFoci`;
 * the standalone clip-play path must do the same, or any focus-bearing clip
 * crashes at the first frame. We mirror that step verbatim so both entry points
 * hand the seam a fully-resolved clip. (Focus-free clips like `flyout` pass
 * through `resolveClipFoci` as a structural no-op.)
 */
import { call, race, take, takeLatest, getContext } from 'typed-redux-saga';

import { startClip, stopClip } from './clipActions';
import { clipRegistry } from '../../data/animation/clips/clipRegistry';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import { clipFociReady } from '../tour/clipFociReady';
import { waitUntil } from '../tour/waitUntil';
import type { SagaContext } from '../../store/types';

export function* watchClipSaga() {
  yield* takeLatest(startClip, function* (action) {
    const playClipSeam = yield* getContext<SagaContext['playClip']>('playClip');
    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const clip = clipRegistry[action.payload];
    yield* race({
      run: call(function* () {
        // Block until every id-bearing cue resolves AND the camera runtime
        // (which carries the FOV resolveClipFoci needs) exists.
        yield* call(
          waitUntil,
          () => clipFociReady(clip.data, resolveDeps()) && cameraRuntime() !== null,
        );
        const resolved = resolveClipFoci(clip.data, resolveDeps(), cameraRuntime()!.fovYRad);
        yield* call(playClipSeam, resolved);
      }),
      stop: take(stopClip),
    });
  });
}
