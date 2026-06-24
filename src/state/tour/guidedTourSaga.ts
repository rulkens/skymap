/**
 * guidedTourSaga — the per-beat worker and (in the next task) the outer tour loop.
 *
 * ### visitBeat: what it does and why each step exists
 *
 * 1. **Wait for data** (`waitUntil focusReady`): a galaxy beat cannot start its
 *    fly clip if the source cloud hasn't loaded yet. Polling until ready means the
 *    tour never starts a fly to a null world position — the fly would stall or
 *    orbit the origin instead. Structure and milkyWay beats resolve immediately;
 *    narration beats (null focus) are trivially ready.
 *
 * 2. **Resolve the focus pose once** (after the wait): calling `extractSelectionRow`
 *    and `focusFraming` once before the fly keeps the clip builders pure — they take
 *    a plain `ResolvedFocus`, not engine handles. The one-time snapshot is correct
 *    because the focus target cannot change mid-beat (the outer loop owns beat
 *    sequencing). A null row (structure not loaded) produces `resolved = null`,
 *    which tells `flyToClip` to hold in place gracefully.
 *
 * 3. **Await the establishing fly** (`call(playClip, flyToClip(...))`): the fly IS
 *    the establishing move — the camera smoothly arrives at the target. Awaiting it
 *    (not forking) means a TOUR_ADVANCE that arrives mid-flight does NOT cut the
 *    camera move short and does NOT skip the current beat. The tour's advance
 *    contract is "wait for the fly to land before the next beat begins". This is
 *    the correctness invariant the `call` enforces.
 *
 * 4. **Dispatch effects verbatim** (`put(e)` for each `beat.effects` entry): beat
 *    effects are plain RTK actions — the author writes exactly what the store
 *    should receive, and `visitBeat` passes them through without an
 *    `applyIntent`/`applyEffect` wrapper. This decouples beat authoring from
 *    intent semantics: the beat is a description of a store state, not a
 *    user-gesture intent.
 *
 * 5. **Show the caption** (`put(showCaption(beat.caption))`): the caption is
 *    transient — it lives only during the dwell phase. `showCaption(null)` after
 *    the race clears it so the next beat starts with no stale chrome.
 *
 * 6. **Race the dwell** (`race({ timeout, next, drift })`): three things compete.
 *    - `timeout = delay(dwellSec * 1000)`: auto-advance after the authored dwell time.
 *    - `next = take(TOUR_ADVANCE)`: user-initiated skip.
 *    - `drift = call(playClip, dwellDrift(beat))`: perpetual ambient camera motion.
 *      `dwellDrift` is intentionally perpetual (`loop: true` spin) so it ALWAYS loses
 *      the race — the timer or the user input wins first, and the drift is cancelled.
 *      A finite drift clip would win on short beats and advance the tour prematurely.
 *
 * ### getContext is read INSIDE the worker
 *
 * The engine registers its saga context AFTER the root saga forks. Reading
 * `getContext` at the call site of `visitBeat` (e.g. in the outer `guidedTour`
 * loop) would race against bootstrap and see null. Reading it here, inside the
 * worker, guarantees the context is populated by the time `visitBeat` runs.
 * This mirrors the pattern in `watchFocusTween` (focusTweenSaga.ts).
 */

import { call, put, take, race, delay, getContext } from 'typed-redux-saga';

import { flyToClip } from './flyToClip';
import { dwellDrift } from './dwellDrift';
import { waitUntil } from './waitUntil';
import { focusReady } from './focusReady';
import { TOUR_ADVANCE } from './tourActions';
import { showCaption } from '../ui/uiSlice';
import { extractSelectionRow } from '../../services/engine/helpers/extractSelectionRow';
import { focusFraming } from '../../services/engine/camera/focusFraming';
import type { BeatData } from '../../@types/tour/BeatData';
import type { ResolvedFocus } from '../../@types/tour/ResolvedFocus';
import type { SagaContext } from '../../store/types';

/**
 * Play one beat of the guided tour: wait for data, fly, dispatch effects,
 * show caption, dwell interactively, clear caption.
 *
 * Callers (the outer `guidedTour` loop, added next task) step through a
 * `BeatData[]` array by calling `yield* call(visitBeat, beat)` in sequence.
 */
export function* visitBeat(beat: BeatData): Generator {
  // Read context inside the worker — the engine sets it after root-saga forks.
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');

  // (1) Block until the focus target's cloud is loaded.
  yield* call(waitUntil, () => focusReady(beat.focus, resolveDeps()));

  // (2) Resolve the focus pose once — after the cloud is confirmed loaded.
  const row = beat.focus === null ? null : extractSelectionRow(beat.focus, resolveDeps());
  const runtime = cameraRuntime();
  const framing = row !== null && runtime !== null ? focusFraming(row, runtime.fovYRad) : null;
  const resolved: ResolvedFocus | null =
    framing !== null ? { worldPos: framing.target, focusMpc: framing.distance } : null;

  // (3) Await the establishing fly — never fork; a mid-flight TOUR_ADVANCE must not cut it.
  yield* call(playClip, flyToClip(beat, resolved));

  // (4) Dispatch beat effects verbatim — no applyIntent/applyEffect wrapper.
  for (const e of beat.effects ?? []) yield* put(e);

  // (5) Show the caption.
  yield* put(showCaption(beat.caption));

  // (6) Race: dwell timer vs user input vs perpetual drift (drift always loses).
  yield* race({
    timeout: delay(beat.dwellSec * 1000),
    next: take(TOUR_ADVANCE),
    drift: call(playClip, dwellDrift(beat)),
  });

  // (7) Clear the caption before the next beat.
  yield* put(showCaption(null));
}
