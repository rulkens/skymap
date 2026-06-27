/**
 * watchTourKeyboardSaga — bind the guided-tour navigation keys, but ONLY while a
 * tour is running.
 *
 * The listener's lifetime is bracketed by the tour: `takeLatest(tourStarted)`
 * binds a fresh `hotkeys-js` channel on each run start, and the `tourEnded` race
 * arm tears it down on a normal exit. `takeLatest` also cancels the in-flight
 * block when a new `tourStarted` supersedes the current run, and the `finally`
 * closes the old channel — so a superseding tour rebinds cleanly with no leaked
 * listener.
 *
 * Why bracketed rather than always-on: the listener `preventDefault`s every
 * registered key synchronously (see `createKeyboardListener`). `Space` is a
 * shared browser gesture — it scrolls the page and activates a focused button —
 * so hijacking it globally would break button activation outside a tour. Binding
 * only during a tour (when the HUD is hidden and there are no focusable buttons)
 * confines that preventDefault to exactly the window where the keys mean
 * something.
 *
 * The keys dispatch the SAME signals the on-screen nav buttons dispatch
 * (`advanceTour` / `prevBeat` / `togglePause`); `pausableDwellSaga` and
 * `guidedTourSaga` are the single home that act on them, so the keyboard and
 * button surfaces share one behaviour with no duplicated routing.
 */

import { call, put, take, race, takeLatest } from 'typed-redux-saga';
import type { EventChannel } from 'redux-saga';
import type { ActionCreatorWithoutPayload } from '@reduxjs/toolkit';

import { createKeyboardListener } from '../../services/input/createKeyboardListener';
import { tourStarted, tourEnded } from './tourSlice';
import { advanceTour, prevBeat, togglePause } from './tourActions';

/** hotkeys-js key name → the tour signal it dispatches. A data table, not a switch. */
const TOUR_KEYS: Record<string, ActionCreatorWithoutPayload> = {
  right: advanceTour,
  left: prevBeat,
  space: togglePause,
};

/** Drain the key channel, dispatching each known key's signal until cancelled. */
function* routeKeys(channel: EventChannel<string>): Generator {
  while (true) {
    const key = yield* take(channel);
    const action = TOUR_KEYS[key];
    if (action) yield* put(action());
  }
}

export function* watchTourKeyboardSaga() {
  yield* takeLatest(tourStarted, function* () {
    const channel = yield* call(createKeyboardListener, Object.keys(TOUR_KEYS).join(','));
    try {
      // `route` runs forever; `ended` ends the block on a normal tour exit. A
      // supersede (new tourStarted) cancels the whole block via takeLatest.
      yield* race({
        route: call(routeKeys, channel),
        ended: take(tourEnded),
      });
    } finally {
      // Runs on tourEnded AND on takeLatest cancellation — unbinds the keys.
      channel.close();
    }
  });
}
