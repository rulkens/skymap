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

import { inspectClipPath, recalcClipPath, clearClipPath } from '../settings/settingsSlice';
import {
  selectClipPathAlign,
  selectClipPathRampSec,
  selectClipPathLinger,
  selectClipPathSpline,
  selectClipPathTurnDelay,
  selectClipPathLookAhead,
  selectClipPathTuningActive,
} from '../settings/selectors';
import type { PathTuning } from '../../services/engine/animation/applyPathTuning';
import { clipRegistry } from '../../data/animation/clips/clipRegistry';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import { applyPathTuning } from '../../services/engine/animation/applyPathTuning';
import { clipFociReady } from '../tour/clipFociReady';
import { waitUntil } from '../tour/waitUntil';
import type { SagaContext } from '../../store/types';
import type { ClipId } from '../../@types/animation/ClipId';

/**
 * Resolve + tune the named clip, then hand it to the seam. `keepStart` picks the
 * seam entry point: `false` (Calculate) captures the live camera as the start;
 * `true` (Re-calc) keeps the start the last Calculate captured, so only foci +
 * tuning are refreshed.
 */
function* sampleInspected(clipId: ClipId, keepStart: boolean) {
  const seam = yield* getContext<SagaContext['clipPathInspect']>('clipPathInspect');
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const clip = clipRegistry[clipId];

  // Block until every id-bearing cue resolves AND the camera runtime (which
  // carries the FOV resolveClipFoci needs) exists — same gate as watchClipSaga.
  yield* call(waitUntil, () => clipFociReady(clip.data, resolveDeps()) && cameraRuntime() !== null);
  const resolved = resolveClipFoci(clip.data, resolveDeps(), cameraRuntime()!.fovYRad);
  // Bake only the ACTIVATED pacing knobs into the flyPath nodes before
  // sampling, so the overlay AND the pinned (replayable) clip carry the
  // overrides — while inactive knobs let the clip's own authored value through.
  const align = yield* select(selectClipPathAlign);
  const rampSec = yield* select(selectClipPathRampSec);
  const linger = yield* select(selectClipPathLinger);
  const spline = yield* select(selectClipPathSpline);
  const turnDelay = yield* select(selectClipPathTurnDelay);
  const lookAhead = yield* select(selectClipPathLookAhead);
  const active = yield* select(selectClipPathTuningActive);
  const tuning: PathTuning = {
    ...(active.align ? { align } : {}),
    ...(active.rampSec ? { rampSec } : {}),
    ...(active.linger ? { linger } : {}),
    ...(active.spline ? { spline } : {}),
    ...(active.turnDelay ? { turnDelay } : {}),
    ...(active.lookAhead ? { lookAhead } : {}),
  };
  const tuned = applyPathTuning(resolved, tuning);
  if (keepStart) seam.recompute(clipId, tuned);
  else seam.compute(clipId, tuned);
}

export function* watchClipPathInspectSaga() {
  yield* takeLatest(inspectClipPath, function* (action) {
    yield* sampleInspected(action.payload, false);
  });

  yield* takeLatest(recalcClipPath, function* (action) {
    yield* sampleInspected(action.payload, true);
  });

  yield* takeEvery(clearClipPath, function* () {
    const seam = yield* getContext<SagaContext['clipPathInspect']>('clipPathInspect');
    seam.clear();
  });
}
