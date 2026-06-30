/**
 * watchClipPathInspectSaga — bridges the debug panel's `inspectClipPath` /
 * `clearClipPath` settings actions to the engine's clip-path inspector seam.
 *
 * The DebugPanel dispatches `inspectClipPath(id)` (the "Calculate" button)
 * instead of reaching an engine handle. This watcher resolves the id against
 * `clipRegistry`, waits for its foci + the camera runtime, resolves the foci to
 * world positions, and calls `clipPathInspect.compute(id, resolved)` — the seam
 * samples the route into the `clipPathInspector` subsystem, which the
 * `clipPathDebugPass` reads each frame. `clearClipPath` drops the snapshot.
 *
 * ### Why mirror watchClipSaga's foci-wait verbatim
 *
 * A clip carrying `flyPath`-with-`atFocus` (the demo path's case) can't be
 * compiled until those ids resolve against loaded catalog/structure data —
 * `compileClip` (called inside the seam) throws on an unresolved cue. So this
 * path waits on `clipFociReady` + a non-null `cameraRuntime` then calls
 * `resolveClipFoci`, exactly like `watchClipSaga` and the tour's `visitBeatSaga`.
 * The only divergence: there's no play/cancel lifecycle — sampling is a single
 * synchronous compute, so no `race`/`[CANCEL]`. `takeLatest` still guards against
 * a rapid re-click superseding an in-flight foci-wait.
 *
 * ### getContext inside the worker
 *
 * Same rationale as `watchClipSaga`: the engine registers saga context AFTER the
 * root saga forks, so the seam is read inside the worker (when an action arrives)
 * rather than at fork time.
 */
import { call, select, takeLatest, takeEvery, getContext } from 'typed-redux-saga';

import { inspectClipPath, clearClipPath } from '../settings/settingsSlice';
import { selectClipPathAlign, selectClipPathRampSec } from '../settings/selectors';
import { clipRegistry } from '../../data/animation/clips/clipRegistry';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import { applyPathTuning } from '../../services/engine/animation/applyPathTuning';
import { clipFociReady } from '../tour/clipFociReady';
import { waitUntil } from '../tour/waitUntil';
import type { SagaContext } from '../../store/types';

export function* watchClipPathInspectSaga() {
  yield* takeLatest(inspectClipPath, function* (action) {
    const seam = yield* getContext<SagaContext['clipPathInspect']>('clipPathInspect');
    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const clip = clipRegistry[action.payload];

    // Block until every id-bearing cue resolves AND the camera runtime (which
    // carries the FOV resolveClipFoci needs) exists — same gate as watchClipSaga.
    yield* call(
      waitUntil,
      () => clipFociReady(clip.data, resolveDeps()) && cameraRuntime() !== null,
    );
    const resolved = resolveClipFoci(clip.data, resolveDeps(), cameraRuntime()!.fovYRad);
    // Bake the live pacing sliders into the flyPath nodes before sampling, so the
    // overlay AND the pinned (replayable) clip carry the tuning.
    const align = yield* select(selectClipPathAlign);
    const rampSec = yield* select(selectClipPathRampSec);
    const tuned = applyPathTuning(resolved, { align, rampSec });
    seam.compute(action.payload, tuned);
  });

  yield* takeEvery(clearClipPath, function* () {
    const seam = yield* getContext<SagaContext['clipPathInspect']>('clipPathInspect');
    seam.clear();
  });
}
