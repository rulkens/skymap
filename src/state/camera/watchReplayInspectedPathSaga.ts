/**
 * watchReplayInspectedPathSaga — replays the clip-path inspector's computed
 * route through the clip-player, deterministically.
 *
 * The debug panel's "Play this path" button dispatches `replayInspectedPath`.
 * Unlike `startClip` — which re-resolves `start: 'live'` from the CURRENT view
 * every time, so each play flies a different curve — this reads the inspector's
 * `pinnedClip()`: the foci-resolved, start-pinned `ClipData` the last "Calculate"
 * produced. Its `start` is already a concrete pose, so `playClip`'s
 * `resolveClipStart` passes it through untouched and the camera flies the EXACT
 * path drawn in the overlay. That makes the path stable across replays — the
 * thing you tune is the thing you watch.
 *
 * ### Why no registry lookup or foci wait (unlike watchClipSaga)
 *
 * The inspector already did both at "Calculate" time (`watchClipPathInspectSaga`
 * waits on `clipFociReady` then calls `resolveClipFoci`, and the seam pins the
 * start). The pinned clip is fully resolved, so this saga just hands it to the
 * player. If nothing has been calculated yet, `pinnedClip()` is null and the
 * dispatch is a harmless no-op.
 *
 * ### The frame comes from the seam, not a fresh `select`
 *
 * `pinnedFrame()` returns the id Calculate baked the route's lookAt/flyPath
 * bearings under. Nothing gates `settings.orientation` between Calculate and
 * Play, so re-selecting it here would decode Calculate-baked bearings as
 * though they were authored under whatever frame is live now — the exact
 * defect `camera.clip.frame` exists to prevent, relocated to between clicks.
 *
 * ### Why race against stopClip
 *
 * Same teardown contract as `watchClipSaga`: a `stopClip` (the panel's Stop
 * button, or Esc) cancels the in-flight play via the seam's `[CANCEL]` hook.
 * `takeLatest` also makes a second replay supersede the first.
 *
 * ### getContext inside the worker
 *
 * The engine registers saga context AFTER the root saga forks, so both seams are
 * read inside the worker (when the action arrives), not at fork time — the same
 * pattern as `watchClipSaga` / `watchClipPathInspectSaga`.
 */
import { call, race, take, takeLatest, getContext } from 'typed-redux-saga';

import { replayInspectedPath, stopClip } from './clipActions';
import type { SagaContext } from '../../store/types';

export function* watchReplayInspectedPathSaga() {
  yield* takeLatest(replayInspectedPath, function* () {
    const playClipSeam = yield* getContext<SagaContext['playClip']>('playClip');
    const inspect = yield* getContext<SagaContext['clipPathInspect']>('clipPathInspect');

    const clip = inspect.pinnedClip();
    // `frame` is the Calculate-time id, not a fresh `select(selectOrientation)`
    // — see the module header's "The frame comes from the seam" section. The
    // two are set/cleared together (computeClipPath.ts), so either both are
    // non-null or this is a harmless no-op alongside the `clip === null` case.
    const frame = inspect.pinnedFrame();
    if (clip === null || frame === null) return; // nothing calculated yet — no-op

    yield* race({
      run: call(playClipSeam, clip, frame),
      stop: take(stopClip),
    });
  });
}
