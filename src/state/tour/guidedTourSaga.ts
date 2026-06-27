/**
 * guidedTourSaga — the outer tour loop: play every beat in order, sandwiched in
 * a snapshot/restore pair, with optional setup effects dispatched before the
 * first beat.
 *
 * ### Why a saga and why only exitTour aborts
 *
 * The outer loop must restore the scene (settings + camera focus) whether the
 * tour finishes naturally or is cut short by the user. A `try/finally` in a
 * generator gives that guarantee unconditionally — a pure-data sequencer that
 * drives beats from outside a saga cannot bind a teardown to its own
 * cancellation. `exitTour` is the only abort signal because the tour's clip@95
 * camera driver swallows drag input: a stray `beginDrag` or `commitCameraPose`
 * should NOT stop the show — the user must dispatch `exitTour` explicitly.
 *
 * ### Setup effects and snapshot ordering
 *
 * `tour.setup?.effects` are dispatched INSIDE the try, AFTER the snapshot is
 * taken. This means the snapshot covers the state before any setup mutation, and
 * `restoreSceneSaga` in the finally winds it all back — both setup effects and
 * per-beat visibility changes are undone in one restore call.
 *
 * ### Why no setUiHidden here
 *
 * HUD-hidden-during-tour is DERIVED from `tour.active`, not toggled imperatively:
 * the App hides the HUD stack while a tour is active and mounts the overlay from
 * the same flag. A separate `setUiHidden(true/false)` would be a second write to
 * coordinate. With a single lifecycle write (`tourStarted` / `tourEnded`) there is
 * nothing to desync, and the finally guards its `tourEnded` behind `cancelled()`
 * (see below) so a superseding run's `tourStarted` is never clobbered by the
 * outgoing run's teardown.
 *
 * ### Capture is a selector, restore is a saga
 *
 * The snapshot is a pure store read — `yield* select(captureScene)` — so capture
 * needs no engine context here. The matching restore DISPATCHES (settings merge +
 * focus revert), so it lives in `restoreSceneSaga`, which reads its own engine
 * context for the fade pass. This saga therefore reaches no `getContext` itself.
 */

import { call, put, select, take, race, cancelled } from 'typed-redux-saga';

import { visitBeatSaga } from './visitBeatSaga';
import { captureScene } from './captureScene';
import { restoreSceneSaga } from './restoreSceneSaga';
import { exitTour } from './tourActions';
import { tourStarted, tourEnded } from './tourSlice';
import type { Tour } from '../../@types/animation/tour/Tour';

/**
 * Play all beats in order, sandwiched in a snapshot/restore pair. Dispatches
 * any `tour.setup?.effects` after the snapshot and before the first beat so
 * the finally unwinds setup mutations along with per-beat changes.
 *
 * This is a saga — not a plain async function — because `try/finally` in a
 * generator runs on BOTH natural completion (all beats finish) and
 * cancellation (exitTour wins the race and redux-saga cancels the `run`
 * arm). A plain async function whose Promise is externally rejected has no
 * equivalent guarantee: the caller must set up a separate teardown path.
 * Here the finally handles both paths with one clause.
 *
 * Only exitTour stops the tour. Camera-input actions (`beginDrag`,
 * `commitCameraPose`, …) must NOT abort the run — the clip@95 driver owns
 * the camera during playback and input actions arrive but have no effect on
 * tour progression. Adding a camera-input `take` here would incorrectly end
 * the tour on any background orbit-controls event.
 */
export function* guidedTourSaga(tour: Tour): Generator {
  // Snapshot the six settings clusters + selection.focus BEFORE setup effects
  // so restore winds back to the user's pre-tour state including any mutations
  // the setup strip makes. A pure store read — no engine context needed.
  const snapshot = yield* select(captureScene);

  // Activate the tour runtime slice — the App derives HUD-hidden + mounts the
  // overlay from `tour.active`.
  yield* put(tourStarted({ tourId: tour.id }));

  try {
    // Dispatch the establishing scene strip. Runs inside the try so the finally
    // restoreSceneSaga winds these mutations back on any exit path.
    for (const e of tour.setup?.effects ?? []) yield* put(e);

    yield* race({
      // `run` sequences the beats by INDEX (not a forward-only for-of), so a
      // `'prev'` outcome can step the index back and re-play the previous beat's
      // establishing fly. Advancing off the last beat ends the run naturally.
      // An exitTour that wins the outer race cancels this arm mid-visitBeatSaga —
      // redux-saga propagates the cancellation into the in-flight playClip call.
      run: call(function* () {
        let i = 0;
        while (i < tour.beats.length) {
          // Delegate (not `call`) so the typed `BeatOutcome` return flows back;
          // cancellation from the outer `exit` race still propagates through the
          // yield* into the in-flight worker.
          const outcome = yield* visitBeatSaga(tour.beats[i]!, i);
          i = outcome === 'prev' ? Math.max(0, i - 1) : i + 1;
        }
      }),
      // `exit` is the only abort: an explicit user/system dispatch, not a
      // stray camera-input action.
      exit: take(exitTour),
    });
  } finally {
    // Runs on natural completion, exitTour, AND supersede cancellation — always
    // restore the captured scene.
    yield* call(restoreSceneSaga, snapshot);

    // Emit the lifecycle `tourEnded` only when THIS run is the one ending. On a
    // takeLatest supersede the incoming run has already put its own `tourStarted`
    // (the finally yields, so the successor runs in between), and a late
    // `tourEnded` from this cancelled finally would clobber it — leaving the HUD
    // shown while the new tour plays. `cancelled()` is true ONLY on an external
    // cancel (supersede); a natural finish or an exitTour-won race completes the
    // try normally, so it stays false there and the tour ends as it should.
    if (!(yield* cancelled())) {
      yield* put(tourEnded());
    }
  }
}
