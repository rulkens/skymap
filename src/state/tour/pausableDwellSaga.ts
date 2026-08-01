/**
 * pausableDwellSaga — the interruptible dwell of a guided-tour beat. After the
 * establishing fly lands, the beat holds on its subject while the beat's own
 * `dwellClip` plays as ambient motion; the viewer can advance, step back, or
 * pause/resume any number of times. This saga owns exactly that concern — the
 * countdown, the pause bookkeeping, and playing the ambient clip — and returns
 * the steering outcome the outer `guidedTourSaga` loop reads.
 *
 * ### One race, pause as state
 *
 * Navigation (`advanceTour` / `prevBeat`) is terminal whether the clock runs or
 * not; only the auto-advance TIMEOUT is pause-sensitive. So there is a single
 * race and `paused` is a boolean — not a second code path duplicating the
 * navigation arms. While running, the race offers a `timeout` arm and forks the
 * ambient clip; while paused it offers neither, so the clock and the camera
 * both hold until the next toggle. `togglePause` flips the boolean; only a
 * running→paused flip subtracts the elapsed slice from `remainingMs`, so resume
 * CONTINUES the countdown rather than restarting it.
 *
 * ### The dwell clip is opaque data; the timer is the authority
 *
 * `dwellSec` is the clip's compiled duration (computed by `visitBeatSaga` from
 * the RESOLVED clip), so on an uninterrupted dwell the clip's ease-out lands
 * exactly as the timer fires. Across a pause/resume the clip REPLAYS FROM ITS
 * START into the shorter remaining window — the saga can't reshape an arbitrary
 * clip the way it could when it owned the `dwellDrift(remaining)` builder — so
 * the post-resume motion gets cut mid-ease at the timer. Accepted trade: the
 * beat owns WHICH ambient clip plays (any clip works), and the cut is a gentle
 * motion interrupted by the next beat's establishing fly.
 *
 * ### Why the loop, and why it terminates
 *
 * Pause/resume is unbounded, so the wait is a `while (true)` loop. It is not
 * open-ended: every non-toggle arm (`next` / `prev` / `timeout`) RETURNS, so the
 * loop runs only as long as the viewer keeps toggling pause.
 *
 * ### Why the clip is forked, not awaited
 *
 * The ambient clip is motion, not an outcome. Forking — never awaiting — keeps
 * its completion out of the race (a finished fork is not an arm) and lets any
 * winning arm tear it down early with `cancel`.
 *
 * ### getContext is read INSIDE the saga
 *
 * The engine registers its saga context AFTER the root saga forks, so reading it
 * here (not at the call site) guarantees it is populated by the time the saga
 * runs — same pattern as `visitBeatSaga` and `watchFocusTweenSaga`.
 */

import { put, take, race, delay, fork, cancel, getContext } from 'typed-redux-saga';

import { advanceTour, prevBeat, togglePause } from './tourActions';
import { setPaused } from './tourSlice';
import type { ClipData } from '../../@types/animation/ClipData';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import type { SagaContext } from '../../store/types';

/** The steering signal the outer tour loop reads: advance forward or step back. */
export type BeatOutcome = 'next' | 'prev';

/**
 * Hold on the beat's subject until the viewer advances / steps back / the timer
 * expires. Pause freezes the countdown (and the ambient clip) and parks until
 * the next toggle; navigation resolves the dwell whether paused or running.
 *
 * `dwellClip` must already be RESOLVED (no id-bearing cues) — `visitBeatSaga`
 * resolves it alongside the establishing clip. `dwellSec` is its compiled
 * duration, passed in so this saga never compiles. `frame` is the orientation
 * `visitBeatSaga` resolved `dwellClip`'s foci under — passed straight through
 * to `playClip` so each replay pins the SAME frame, not whatever is live when
 * a post-pause slice restarts it.
 */
export function* pausableDwellSaga(
  dwellClip: ClipData,
  dwellSec: number,
  frame: OrientationFrameId,
): Generator<unknown, BeatOutcome> {
  // Read context inside the saga — the engine sets it after root-saga forks.
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');

  let remainingMs = dwellSec * 1000;
  let paused = false;

  while (true) {
    // The ambient clip runs only while the clock runs. A post-pause slice
    // replays it from the start (see the module header for the trade-off).
    const driftTask = paused ? null : yield* fork(playClip, dwellClip, frame);
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
