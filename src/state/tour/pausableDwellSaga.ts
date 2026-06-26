/**
 * pausableDwellSaga — the interruptible dwell timer of a guided-tour beat. After
 * the establishing fly lands, the beat holds on its subject for `beat.dwellSec`
 * while gentle ambient drift plays; the viewer can advance, step back, or
 * pause/resume any number of times. This saga owns exactly that concern — the
 * countdown, the pause bookkeeping, and the ambient drift — and returns the
 * steering outcome the outer `guidedTourSaga` loop reads.
 *
 * ### One race, pause as state
 *
 * Navigation (`advanceTour` / `prevBeat`) is terminal whether the clock runs or
 * not; only the auto-advance TIMEOUT is pause-sensitive. So there is a single
 * race and `paused` is a boolean — not a second code path duplicating the
 * navigation arms. While running, the race offers a `timeout` arm and forks the
 * ambient drift; while paused it offers neither, so the clock and the camera
 * both hold until the next toggle. `togglePause` flips the boolean; only a
 * running→paused flip subtracts the elapsed slice from `remainingMs`, so resume
 * CONTINUES the countdown rather than restarting it.
 *
 * ### Why the loop, and why it terminates
 *
 * Pause/resume is unbounded, so the wait is a `while (true)` loop. It is not
 * open-ended: every non-toggle arm (`next` / `prev` / `timeout`) RETURNS, so the
 * loop runs only as long as the viewer keeps toggling pause.
 *
 * ### Why drift is forked, not awaited
 *
 * `dwellDrift` is perpetual ambient motion, not an outcome. Awaiting it would
 * deadlock the race (it never settles); forking lets it run under the race and
 * be torn down with `cancel` the instant any arm wins.
 *
 * ### getContext is read INSIDE the saga
 *
 * The engine registers its saga context AFTER the root saga forks, so reading it
 * here (not at the call site) guarantees it is populated by the time the saga
 * runs — same pattern as `visitBeatSaga` and `watchFocusTweenSaga`.
 */

import { put, take, race, delay, fork, cancel, getContext } from 'typed-redux-saga';

import { dwellDrift } from './dwellDrift';
import { advanceTour, prevBeat, togglePause } from './tourActions';
import { setPaused } from './tourSlice';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { SagaContext } from '../../store/types';

/** The steering signal the outer tour loop reads: advance forward or step back. */
export type BeatOutcome = 'next' | 'prev';

/**
 * Hold on the beat's subject until the viewer advances / steps back / the timer
 * expires. Pause freezes the countdown (and the drift) and parks until the next
 * toggle; navigation resolves the dwell whether paused or running.
 */
export function* pausableDwellSaga(beat: BeatData): Generator<unknown, BeatOutcome> {
  // Read context inside the saga — the engine sets it after root-saga forks.
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');

  let remainingMs = beat.dwellSec * 1000;
  let paused = false;

  while (true) {
    // Drift is ambient motion — it runs only while the clock runs.
    const driftTask = paused ? null : yield* fork(playClip, dwellDrift(beat));
    const sliceStartedAt = Date.now();

    // One race. The `timeout` arm is present only while running; when paused the
    // race waits on navigation + toggle alone, so the countdown holds.
    const winner = yield* race({
      ...(paused ? {} : { timeout: delay(remainingMs) }),
      next: take(advanceTour),
      prev: take(prevBeat),
      toggle: take(togglePause),
    });
    if (driftTask) yield* cancel(driftTask); // stop the ambient motion

    // A terminal arm ends the dwell. Clear our transient `paused` flag on the
    // way out so it never leaks into the next beat (we own it; we reset it).
    if (winner.next || winner.prev || winner.timeout) {
      if (paused) yield* put(setPaused(false));
      return winner.prev ? 'prev' : 'next';
    }

    // winner.toggle — flip pause state. Only a running→paused flip consumes time.
    if (!paused) remainingMs -= Date.now() - sliceStartedAt;
    paused = !paused;
    yield* put(setPaused(paused));
  }
}
