/**
 * visitBeatSaga — the per-beat worker of the guided tour.
 *
 * ### What it does and why each step exists
 *
 * 1. **Wait for clip foci AND camera runtime** (`waitUntil clipFociReady && cameraRuntime`):
 *    a clip that contains `moveTargetId`/`dollyToId`/`focusId` cues cannot be
 *    resolved until the relevant catalog data is loaded. `clipFociReady` walks
 *    the clip's effect tree and returns false as soon as any id-bearing cue
 *    cannot be resolved — so the saga polls until all ids are resolvable. The
 *    camera runtime gate is also checked here: `resolveClipFoci` needs the
 *    current FOV to compute framing distances, and the runtime is null
 *    pre-bootstrap.
 *
 * 2. **Resolve clip foci once** (after the wait): `resolveClipFoci` rewrites
 *    every `moveTargetId`, `dollyToId`, and `focusId` leaf to its concrete
 *    equivalent in a single pass. The one-time snapshot is correct because the
 *    focus target cannot change mid-beat (the outer loop owns beat sequencing).
 *    Resolving after the wait guarantees the engine state is consistent — no
 *    partially-loaded catalogs.
 *
 * 3. **Await the establishing fly** (`call(playClip, clip)`): the resolved clip
 *    IS the establishing move. Awaiting it (not forking) means an `advanceTour`
 *    that arrives mid-flight does NOT cut the camera move short and does NOT skip
 *    the current beat. The advance contract is "wait for the clip to land before
 *    the next beat begins." This is the correctness invariant the `call` enforces.
 *
 * 4. **Show the caption** (`put(showCaption(beat.caption))`): the caption is
 *    transient — it lives only during the dwell phase. `showCaption(null)` after
 *    the race clears it so the next beat starts without stale chrome.
 *
 * 5. **Race the dwell** (`race({ timeout, next, drift })`): three things compete.
 *    - `timeout = delay(dwellSec * 1000)`: auto-advance after the authored dwell time.
 *    - `next = take(advanceTour)`: user-initiated skip.
 *    - `drift = call(playClip, dwellDrift(beat))`: perpetual ambient camera motion.
 *      `dwellDrift` is intentionally perpetual (`loop: true` spin) so it ALWAYS loses
 *      the race — the timer or the user input wins first, and the drift is cancelled.
 *      A finite drift clip would win on short beats and advance the tour prematurely.
 *
 * ### getContext is read INSIDE the worker
 *
 * The engine registers its saga context AFTER the root saga forks. Reading
 * `getContext` at the call site of `visitBeatSaga` (e.g. in the outer
 * `guidedTourSaga` loop) would race against bootstrap and see null. Reading it
 * here, inside the worker, guarantees the context is populated by the time
 * `visitBeatSaga` runs. This mirrors the pattern in `watchFocusTweenSaga`
 * (watchFocusTweenSaga.ts).
 */

import { call, put, take, race, delay, getContext } from 'typed-redux-saga';

import { dwellDrift } from './dwellDrift';
import { waitUntil } from './waitUntil';
import { clipFociReady } from './clipFociReady';
import { advanceTour } from './tourActions';
import { showCaption } from '../ui/uiSlice';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { SagaContext } from '../../store/types';

/**
 * Play one beat of the guided tour: wait for clip data, resolve focus ids,
 * play the clip, show caption, dwell interactively, clear caption.
 *
 * The outer `guidedTourSaga` loop steps through a `BeatData[]` by calling
 * `yield* call(visitBeatSaga, beat)` in sequence.
 */
export function* visitBeatSaga(beat: BeatData): Generator {
  // Read context inside the worker — the engine sets it after root-saga forks.
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');

  // (1) Block until every id-bearing cue in the clip resolves AND the camera
  //     runtime is available. Both are needed by resolveClipFoci (step 2).
  yield* call(waitUntil, () => clipFociReady(beat.clip, resolveDeps()) && cameraRuntime() !== null);

  // (2) Resolve clip foci once — after all ids are confirmed resolvable.
  const clip = resolveClipFoci(beat.clip, resolveDeps(), cameraRuntime()!.fovYRad);

  // (3) Await the establishing clip — never fork; a mid-flight advanceTour must not cut it.
  yield* call(playClip, clip);

  // (4) Show the caption.
  yield* put(showCaption(beat.caption));

  // (5) Race: dwell timer vs user input vs perpetual drift (drift always loses).
  yield* race({
    timeout: delay(beat.dwellSec * 1000),
    next: take(advanceTour),
    drift: call(playClip, dwellDrift(beat)),
  });

  // (6) Clear the caption before the next beat.
  yield* put(showCaption(null));
}
