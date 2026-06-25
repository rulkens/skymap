/**
 * guidedTourSaga — the outer tour loop: play every beat in order, sandwiched in
 * a snapshot/restore pair.
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
 * ### getContext is read INSIDE the saga
 *
 * The engine registers its saga context AFTER the root saga forks, so reading
 * `getContext` here (not at fork time) guarantees the context is populated by the
 * time the tour runs. Same pattern as `visitBeatSaga` and `watchFocusTween`.
 */

import { call, put, take, race, getContext } from 'typed-redux-saga';

import { visitBeatSaga } from './visitBeatSaga';
import { exitTour } from './tourActions';
import { setUiHidden } from '../ui/uiSlice';
import type { BeatData } from '../../@types/tour/BeatData';
import type { SagaContext } from '../../store/types';

/**
 * Play all beats in order, sandwiched in a snapshot/restore pair.
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
export function* guidedTourSaga(beats: readonly BeatData[]): Generator {
  // Read context inside the saga — the engine sets it after root-saga forks,
  // same pattern as visitBeatSaga and watchFocusTween.
  const fx = yield* getContext<SagaContext['reconcile']>('reconcile');

  // Snapshot the six settings clusters + selection.focus so restore can
  // wind the scene back exactly to where the user left off.
  const snapshot = fx.captureScene();

  // Hide the UI chrome for the duration of the tour.
  yield* put(setUiHidden(true));

  try {
    yield* race({
      // `run` sequences every beat; an exitTour that wins the race cancels
      // this arm mid-visitBeatSaga — redux-saga propagates the cancellation into
      // the in-flight playClip call automatically.
      run: call(function* () {
        for (const beat of beats) yield* call(visitBeatSaga, beat);
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
