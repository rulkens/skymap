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
 * `restoreScene` in the finally winds it all back — both setup effects and
 * per-beat visibility changes are undone in one restore call.
 *
 * ### getContext is read INSIDE the saga
 *
 * The engine registers its saga context AFTER the root saga forks, so reading
 * `getContext` here (not at fork time) guarantees the context is populated by the
 * time the tour runs. Same pattern as `visitBeatSaga` and `watchFocusTweenSaga`.
 */

import { call, put, take, race, getContext } from 'typed-redux-saga';

import { visitBeatSaga } from './visitBeatSaga';
import { exitTour } from './tourActions';
import { setUiHidden } from '../ui/uiSlice';
import type { Tour } from '../../@types/animation/tour/Tour';
import type { SagaContext } from '../../store/types';

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
  // Read context inside the saga — the engine sets it after root-saga forks,
  // same pattern as visitBeatSaga and watchFocusTweenSaga.
  const fx = yield* getContext<SagaContext['reconcile']>('reconcile');

  // Snapshot the six settings clusters + selection.focus BEFORE setup effects
  // so restore winds back to the user's pre-tour state including any mutations
  // the setup strip makes.
  const snapshot = fx.captureScene();

  // Hide the UI chrome for the duration of the tour.
  yield* put(setUiHidden(true));

  try {
    // Dispatch the establishing scene strip. Runs inside the try so the finally
    // restoreScene call winds these mutations back on any exit path.
    for (const e of tour.setup?.effects ?? []) yield* put(e);

    yield* race({
      // `run` sequences every beat; an exitTour that wins the race cancels
      // this arm mid-visitBeatSaga — redux-saga propagates the cancellation into
      // the in-flight playClip call automatically.
      run: call(function* () {
        for (const beat of tour.beats) yield* call(visitBeatSaga, beat);
      }),
      // `exit` is the only abort: an explicit user/system dispatch, not a
      // stray camera-input action.
      exit: take(exitTour),
    });
  } finally {
    // Runs on BOTH natural completion and exitTour cancellation.
    fx.restoreScene(snapshot, { animate: true });
    yield* put(setUiHidden(false));
  }
}
