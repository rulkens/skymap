/**
 * visitBeatSaga — the per-beat worker of the guided tour. Returns the outcome
 * the outer loop steers by: `'next'` (advance / auto-advance) or `'prev'`
 * (step back). `exitTour` is NOT handled here — it aborts the whole run via
 * `guidedTourSaga`'s outer race, which cancels this worker mid-flight.
 *
 * ### What each step does and why
 *
 * 1. **Mark the beat active** (`put(beatChanged(index))`): sets the slice's
 *    `beatIndex` for the "02 / 03" readout AND signals the overlay to hide the
 *    previous caption while the establishing fly is in flight. The new beat's
 *    caption is derived (registry + index), so the saga never dispatches caption
 *    text — only the index that selectors resolve it from.
 *
 * 2. **Wait for clip foci AND camera runtime** (`waitUntil`): a clip carrying
 *    `moveTargetId`/`dollyToId`/`focusId` cues cannot resolve until the relevant
 *    catalog data is loaded; `resolveClipFoci` also needs the current FOV, which
 *    is null pre-bootstrap. Poll until both are available.
 *
 * 3. **Resolve foci once, then await the fly** (`call(playClip, clip)`): the
 *    resolved clip IS the establishing move. Awaiting it (never forking) means a
 *    mid-flight `advanceTour`/`prevBeat` does not cut the camera move short — the
 *    advance contract is "land the clip before the next beat begins".
 *
 * 4. **Start the dwell** (`put(dwellStarted())`): the fly has landed. Bumping the
 *    dwell nonce is what fades the caption in and starts the countdown ring —
 *    kept separate from `beatChanged` (fly START) so the ring begins on the
 *    LANDING, not during the fly.
 *
 * 5. **Race the pausable dwell**: the ambient `dwellDrift` clip is FORKED (it is
 *    motion, not an outcome — a perpetual clip would deadlock as a race arm, and
 *    a resolving one would falsely settle the race), and the race is over only
 *    `timeout` (auto-advance after `dwellSec`), `advanceTour` (→ next),
 *    `prevBeat` (→ prev), and `togglePause` (freeze). When the race settles we
 *    `cancel` the drift, which tears down the in-flight clip. On pause we freeze
 *    the REMAINING time (so resume continues, not restarts), park on the next
 *    `togglePause`, and re-fork/re-race; `advanceTour`/`prevBeat` still resolve
 *    the beat while paused, and no drift runs while paused so the camera holds.
 *
 * ### getContext is read INSIDE the worker
 *
 * The engine registers its saga context AFTER the root saga forks, so reading it
 * here (not at the call site) guarantees it is populated by the time the worker
 * runs — same pattern as `watchFocusTweenSaga`.
 */

import { call, put, take, race, delay, fork, cancel, getContext } from 'typed-redux-saga';

import { dwellDrift } from './dwellDrift';
import { waitUntil } from './waitUntil';
import { clipFociReady } from './clipFociReady';
import { advanceTour, prevBeat, togglePause } from './tourActions';
import { beatChanged, dwellStarted, setPaused } from './tourSlice';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { SagaContext } from '../../store/types';

/** The steering signal the outer loop reads: advance forward or step back. */
export type BeatOutcome = 'next' | 'prev';

/**
 * Play one beat: announce the index, wait for clip data, resolve foci, fly,
 * then dwell interactively until the user advances / steps back / the timer
 * expires. The outer `guidedTourSaga` loop adjusts its index from the outcome.
 */
export function* visitBeatSaga(beat: BeatData, index: number): Generator<unknown, BeatOutcome> {
  // Read context inside the worker — the engine sets it after root-saga forks.
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');

  // (1) Announce the beat — sets the index, hides the previous caption.
  yield* put(beatChanged(index));

  // (2) Block until every id-bearing cue resolves AND the camera runtime exists.
  yield* call(waitUntil, () => clipFociReady(beat.clip, resolveDeps()) && cameraRuntime() !== null);

  // (3) Resolve foci once, then await the establishing fly. Never fork.
  const clip = resolveClipFoci(beat.clip, resolveDeps(), cameraRuntime()!.fovYRad);
  yield* call(playClip, clip);

  // (4) The fly landed — start the dwell (fades caption in, starts the ring).
  yield* put(dwellStarted());

  // (5) Pausable dwell. `remaining` is the countdown; pause freezes it. The
  //     drift is forked (ambient motion) and cancelled when the race settles.
  let remaining = beat.dwellSec * 1000;
  for (;;) {
    const driftTask = yield* fork(playClip, dwellDrift(beat));
    const startedAt = Date.now();
    const phase = yield* race({
      timeout: delay(remaining),
      next: take(advanceTour),
      prev: take(prevBeat),
      pause: take(togglePause),
    });
    yield* cancel(driftTask); // stop the ambient motion (cancels the in-flight clip)

    if (phase.prev) return 'prev';
    if (phase.next || phase.timeout) return 'next';

    // phase.pause — freeze the time that was left and park until resume.
    remaining -= Date.now() - startedAt;
    yield* put(setPaused(true));
    const resumed = yield* race({
      resume: take(togglePause),
      next: take(advanceTour),
      prev: take(prevBeat),
    });
    yield* put(setPaused(false));
    if (resumed.prev) return 'prev';
    if (resumed.next) return 'next';
    // resumed.resume — loop and re-fork/re-race with the reduced `remaining`.
  }
}
